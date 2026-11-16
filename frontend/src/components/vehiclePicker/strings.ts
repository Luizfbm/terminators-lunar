// The words of the vehicle picker: the window that opens before a landing to choose the vehicle and
// the dates. Plain data: messages.ts spreads it into the app's catalogues, so `t` reads these keys.
// Between a number and its unit goes a no-break space, as in the rest of the catalogue.
// The rovers' descriptions and sources in pt are nasa-2026's `shortDesc` and `src` (see vehicles.ts);
// en is their translation.
// The picker window itself reads only `en` (it is English always, whatever the app's language), so `pt`
// is no longer shown by it; it stays because messages.ts spreads both into the app's catalogues.
export const en = {
  'vehiclePicker.title': 'Choose the vehicle',
  'vehiclePicker.pick': 'Choose',
  'vehiclePicker.close': 'Close',
  'vehiclePicker.prev': 'Previous vehicle',
  'vehiclePicker.next': 'Next vehicle',
  'vehiclePicker.start': 'Start date',
  'vehiclePicker.end': 'End date',
  'vehiclePicker.coverage': 'Calculation window available: {min} to {max}.',
  'vehiclePicker.error.order': 'The end must be after the start.',
  'vehiclePicker.error.outside': 'A date is outside the calculation window available.',
  'vehiclePicker.error.too_long': 'The window can span at most {days} days.',
  'vehiclePicker.localTime': 'Times in your local time zone.',
  'vehiclePicker.darkLine': '{hours}\u00a0h in the dark',
  'vehiclePicker.stats': 'Figures of {name}',
  'vehiclePicker.stat.dark': 'autonomy in the dark',
  'vehiclePicker.stat.battery': 'battery',
  'vehiclePicker.stat.solar': 'solar panel (peak)',
  'vehiclePicker.stat.noCharge': 'no recharge',
  'vehiclePicker.stat.mass': 'mass',
  'vehiclePicker.stat.mast': 'mast height',
  'vehiclePicker.estimate': '* estimate',
  'vehiclePicker.rover.lrv.desc': '1971–72 · 2 astronauts · 81.8\u00a0cm steel-mesh wheels',
  'vehiclePicker.rover.lrv.source':
    'NSSDC: 210\u00a0kg, 3.10\u00a0m, 2× 36\u00a0V · 121\u00a0Ah batteries (silver-zinc, not rechargeable). Average consumption estimated.',
  'vehiclePicker.rover.viper.desc': 'South-pole ice hunter · 1\u00a0m drill · 3 vertical solar panels',
  'vehiclePicker.rover.viper.source':
    'NASA/NTRS (LSIC 2024): 5,420\u00a0Wh battery, 320–450\u00a0W panels; 57\u00a0h on the battery alone in a test → ~95\u00a0W.',
  'vehiclePicker.rover.ltv.desc': 'In development · 2 astronauts · design not yet frozen',
  'vehiclePicker.rover.ltv.source': 'NASA has published neither mass nor dimensions; the values are class estimates (~500\u00a0kg).',
  'vehiclePicker.rover.mapp.desc': 'Compact commercial rover · solar wall on the side and camera tower',
  'vehiclePicker.rover.mapp.source': 'Illustrative values (the maker has not published a full data sheet).',
}

export const pt: Record<keyof typeof en, string> = {
  'vehiclePicker.title': 'Escolha o veículo',
  'vehiclePicker.pick': 'Escolher',
  'vehiclePicker.close': 'Fechar',
  'vehiclePicker.prev': 'Veículo anterior',
  'vehiclePicker.next': 'Próximo veículo',
  'vehiclePicker.start': 'Data de início',
  'vehiclePicker.end': 'Data fim',
  'vehiclePicker.coverage': 'Janela de cálculo disponível: {min} a {max}.',
  'vehiclePicker.error.order': 'O fim precisa ser depois do início.',
  'vehiclePicker.error.outside': 'Uma data está fora da janela de cálculo disponível.',
  'vehiclePicker.error.too_long': 'A janela pode cobrir no máximo {days} dias.',
  'vehiclePicker.localTime': 'Horários no seu fuso local.',
  'vehiclePicker.darkLine': '{hours}\u00a0h no escuro',
  'vehiclePicker.stats': 'Números de {name}',
  'vehiclePicker.stat.dark': 'autonomia no escuro',
  'vehiclePicker.stat.battery': 'bateria',
  'vehiclePicker.stat.solar': 'painel solar (pico)',
  'vehiclePicker.stat.noCharge': 'sem recarga',
  'vehiclePicker.stat.mass': 'massa',
  'vehiclePicker.stat.mast': 'altura do mastro',
  'vehiclePicker.estimate': '* estimativa',
  'vehiclePicker.rover.lrv.desc': '1971–72 · 2 astronautas · rodas de tela de aço de 81,8\u00a0cm',
  'vehiclePicker.rover.lrv.source':
    'NSSDC: 210\u00a0kg, 3,10\u00a0m, 2× baterias 36\u00a0V · 121\u00a0Ah (prata-zinco, não recarregáveis). Consumo médio estimado.',
  'vehiclePicker.rover.viper.desc': 'Caçador de gelo do polo sul · broca de 1\u00a0m · 3 painéis solares verticais',
  'vehiclePicker.rover.viper.source':
    'NASA/NTRS (LSIC 2024): bateria 5.420\u00a0Wh, painéis 320–450\u00a0W; 57\u00a0h só na bateria em teste → ~95\u00a0W.',
  'vehiclePicker.rover.ltv.desc': 'Em desenvolvimento · 2 astronautas · desenho ainda não congelado',
  'vehiclePicker.rover.ltv.source': 'NASA não publicou massa nem dimensões; valores são estimativas de classe (~500\u00a0kg).',
  'vehiclePicker.rover.mapp.desc': 'Rover comercial compacto · parede solar lateral e torre de câmeras',
  'vehiclePicker.rover.mapp.source': 'Valores ilustrativos (fabricante não publicou ficha completa).',
}
