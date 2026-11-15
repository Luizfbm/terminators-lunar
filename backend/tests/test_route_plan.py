"""Only the new route endpoint, geometry and movement scenario."""
import math
from datetime import UTC, datetime

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import route_plan as rp
from app.constants import MOON_RADIUS_M as R
from app.heights import Grid
from app.main import app

client = TestClient(app)


def payload():
    return {
        "origin": {"latitude_deg": 0, "longitude_deg": 180},
        "destination": {"latitude_deg": 0, "longitude_deg": -180+math.degrees(40/R)},
        "start": "2026-11-15T00:00:00Z", "end": "2026-11-16T00:00:00Z",
        "max_slope_deg": 15,
    }


@pytest.fixture
def terrain(monkeypatch):
    grid = Grid("measured-test", 20, "eqc", 20, -10, 10, np.zeros((3, 3)))
    monkeypatch.setattr(rp, "read_grid", lambda _: grid)
    monkeypatch.setattr(rp.ephemeris, "kernel_names", lambda: ["test-kernel"])
    return grid


def test_api_spatial_route_and_native_pixels(terrain):
    response = client.post('/routes/plan', json=payload())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['status'] == 'found'
    assert body['length_m'] == pytest.approx(40)
    assert len(body['points']) == 3
    assert body['points'][-1]['distance_m'] == pytest.approx(body['length_m'])
    assert body['motion_status'] == 'not_requested'
    assert body['terrain']['dem']['product'] == 'measured-test'
    assert body['terrain']['site']['latitude_deg'] == 0
    assert body['terrain']['heights']['values'] == [0]*9
    assert body['destination_snap_m'] < 1e-7


def motion_request():
    body = payload()
    body['motion'] = dict(speed_m_s=1/90, load_w=10, battery_wh=20,
                          initial_charge_fraction=.5, panel_power_w=20)
    return body


def test_movement_recomputes_each_position_and_integrates(terrain, monkeypatch):
    seen = []
    def observe(lat, lon, instant, height):
        seen.append((lat, lon, instant))
        # Dark first half, bright second half, with 900s samples.
        return (0 if instant.hour == 0 else 1), instant.hour >= 1, 1, ['DEM']
    monkeypatch.setattr(rp, 'observe', observe)
    response = client.post('/routes/plan', json=motion_request())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['motion_status'] == 'evaluated'
    assert body['duration_seconds'] == pytest.approx(3600)
    assert len(seen) >= 5
    assert len({p[1] for p in seen}) == len(seen)
    assert seen[0][2] == datetime(2026, 11, 15, tzinfo=UTC)
    assert body['samples'][0]['charge_fraction'] == .5
    assert body['samples'][-1]['charge_fraction'] == pytest.approx(0, abs=1e-9)
    assert body['unmet_wh'] == pytest.approx(0, abs=1e-8)
    assert body['horizon_products'] == ['DEM']


def test_constant_solar_and_partial_initial_charge(terrain, monkeypatch):
    monkeypatch.setattr(rp, 'observe', lambda *args: (1, True, .5, ['DEM']))
    body = client.post('/routes/plan', json=motion_request()).json()
    assert all(s['charge_fraction'] == pytest.approx(.5) for s in body['samples'])
    assert body['unmet_wh'] == 0


@pytest.mark.parametrize('stored,net,expected,unmet', [(5,-10,0,5), (5,30,20,0), (0,-10,0,10), (5,0,5,0)])
def test_energy_balance_analytical(stored, net, expected, unmet):
    assert rp.integrate(stored,20,net,3600) == (expected,unmet)


def test_time_and_sample_limits_do_not_evaluate(terrain, monkeypatch):
    monkeypatch.setattr(rp, 'observe', lambda *a: pytest.fail('must not request ephemerides'))
    body = motion_request()
    body['end'] = '2026-11-15T00:10:00Z'
    result = client.post('/routes/plan', json=body).json()
    assert result['motion_status'] == 'outside_window'
    assert result['samples'] == []
    body['end'] = '2026-12-15T00:00:00Z'
    body['motion']['speed_m_s'] = .0001
    assert client.post('/routes/plan', json=body).json()['motion_status'] == 'sample_limit'


def test_missing_horizon_does_not_return_partial_energy(terrain, monkeypatch):
    def missing(*args):
        raise rp.horizon.DemUnavailable('test', 'missing')
    monkeypatch.setattr(rp, 'observe', missing)
    result = client.post('/routes/plan', json=motion_request()).json()
    assert result['status'] == 'found'
    assert result['motion_status'] == 'outside_coverage'
    assert result['samples'] == []
    assert result['unmet_wh'] is None


def test_no_path_and_destination_outside_window(terrain):
    terrain.heights[:,1] = 1000
    result = client.post('/routes/plan', json=payload()).json()
    assert result['status'] == 'no_path_in_window'
    assert result['points'] == []
    body = payload()
    body['destination']['latitude_deg'] = 30
    response = client.post('/routes/plan', json=body)
    assert response.status_code == 422
    assert response.json()['code'] == 'outside_coverage'


@pytest.mark.parametrize('field,value', [('max_slope_deg',90), ('minimum_resolution_m',5), ('start','2026-11-15'), ('end','2026-11-14T00:00:00Z')])
def test_invalid_requests(field,value,terrain):
    body = payload(); body[field] = value
    assert client.post('/routes/plan', json=body).status_code == 422


def test_busy_slot_releases_after_failure(terrain):
    assert rp._SLOT.acquire(blocking=False)
    try:
        assert client.post('/routes/plan', json=payload()).status_code == 503
    finally:
        rp._SLOT.release()
    bad = payload(); bad['destination']['latitude_deg'] = 60
    assert client.post('/routes/plan', json=bad).status_code == 422
    assert client.post('/routes/plan', json=payload()).status_code == 200


@pytest.mark.parametrize('projection,lat,lon', [('polar',-89,30),('polar_north',89,30),('eqc',60,-179.999)])
def test_projection_round_trip(projection,lat,lon):
    latitude,longitude = math.radians(lat),math.radians(lon)
    if projection == 'eqc':
        x,y = R*math.radians(lon-180),R*latitude
    else:
        north = projection == 'polar_north'
        rho = 2*R*math.tan(math.pi/4-latitude/2 if north else math.pi/4+latitude/2)
        x,y = rho*math.sin(longitude),rho*math.cos(longitude)*(-1 if north else 1)
    grid = Grid('test',20,projection,20,x-30,y+30,np.zeros((3,3)))
    assert rp.pixel(grid,rp.Coordinates(latitude_deg=lat,longitude_deg=lon)) == (1,1)
    assert rp.coordinates(grid,1,1) == pytest.approx((lat,lon),abs=1e-9)


def test_native_resolution_selection_and_window_crop(tmp_path, monkeypatch):
    from tests.synthetic_dem import POLAR, polar_xy, write_dem
    monkeypatch.setenv('LUNAR_DEM_DIR', str(tmp_path))
    centre = polar_xy(-89.9,30)
    write_dem(tmp_path/'LDEM_80S_20MPP_ADJ.TIF',centre,20,400,lambda x,y: .001*x+.002*y,POLAR)
    write_dem(tmp_path/'LDEM_80S_80MPP_ADJ.TIF',centre,80,400,lambda x,y: .001*x+.002*y,POLAR)
    request = rp.RouteRequest.model_validate({**payload(),'origin':{'latitude_deg':-89.9,'longitude_deg':30},'half_extent_m':3000})
    fine = rp.read_grid(request)
    assert fine.heights.shape == (129,129)
    assert fine.metres_per_pixel == 20
    assert fine.product == 'LDEM_80S_20MPP_ADJ'
    request.minimum_resolution_m = 80
    coarse = rp.read_grid(request)
    assert coarse.metres_per_pixel == 80
    assert coarse.product == 'LDEM_80S_80MPP_ADJ'
    # Native coordinate geometry survives the crop: values still follow the source plane.
    for r,c in [(0,0),(64,64),(128,128)]:
        x=fine.x_min_m+(c+.5)*20
        y=fine.y_max_m-(r+.5)*20
        assert fine.heights[r,c] == pytest.approx(.001*x+.002*y,abs=.001)


def test_observe_rejects_flat_fallback(monkeypatch):
    monkeypatch.setattr(rp.horizon,'mask',lambda *a: rp.horizon.flat(-89,30,2))
    with pytest.raises(rp.ApiProblem,match='requires measured terrain'):
        rp.observe(-89,30,datetime(2026,11,15,tzinfo=UTC),2)


def test_contract_example_matches_response_shape():
    import json
    from pathlib import Path
    example = json.loads((Path(__file__).resolve().parents[2]/'contract/examples/route-plan.example.json').read_text())['value']
    result = rp.RouteResponse.model_validate(example)
    assert result.status == 'found'
    assert result.motion_status == 'evaluated'
    assert result.terrain['site']['source'] == 'custom'


def test_polar_motion_interpolates_in_grid_not_across_longitude_seam(monkeypatch):
    # Opposite longitudes close to the pole: a grid edge crosses near the pole,
    # not the parallel halfway around it. Verify the interior sample at its map centre.
    terrain = Grid('pole',20,'polar',20,-10,10,np.zeros((3,3)))
    monkeypatch.setattr(rp,'read_grid',lambda _: terrain)
    monkeypatch.setattr(rp.ephemeris,'kernel_names',lambda: ['test'])
    seen=[]
    monkeypatch.setattr(rp,'observe',lambda lat,lon,*rest: (seen.append((lat,lon)) or (1,True,1,['pole'])))
    start=rp.coordinates(terrain,0,0)
    end=rp.coordinates(terrain,0,1)
    body=motion_request()
    body['origin']=dict(latitude_deg=start[0],longitude_deg=start[1])
    body['destination']=dict(latitude_deg=end[0],longitude_deg=end[1])
    body['motion']['speed_m_s']=.01
    result=client.post('/routes/plan',json=body)
    assert result.status_code == 200,result.text
    assert result.json()['motion_status'] == 'evaluated'
    assert len(seen) == 4
    assert seen[1] == pytest.approx(rp.coordinates(terrain,0,1/3),abs=1e-9)
