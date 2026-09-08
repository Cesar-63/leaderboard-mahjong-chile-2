// i18n.js — traducciones ES / EN / PT
// window.tr(key, vars) devuelve el texto del idioma activo (window.LANG).
// Si falta la clave cae a ES, y si tampoco está devuelve la propia key.
// Las variables se interpolan con {nombre}.

window.I18N = {
  es: {
    all: "Todas",
    app_title: 'Liga Mahjong Chile',
    app_tagline: 'Riichi · Temporada 2026',
    divisiones: 'divisiones',
    jugadores: 'jugadores',
    sesiones_noun: 'sesiones',
    hanchan_total: '{n} hanchan',
    official_data: 'DATOS OFICIALES',
    division: 'División {d}',
    leader: 'Líder {name}',
    standings_title: 'Clasificación División {div}',
    session_summary: 'Sesión {played} de {total} · {per} hanchan por sesión',
    /* tab labels (también se usan en TABS) */
    tabla: 'Tabla',
    jugador: 'Jugador',
    comparador: 'Comparador',
    historial: 'Historial',
    iormc: 'IORMC',
    calendario: 'Calendario',
    records: 'Records',
    /* tweaks */
    tweaks_title: 'Ajustes',
    tema: 'Tema',
    estilo: 'Estilo',
    disposicion_str: 'Disposición',
    oscuro: 'Modo oscuro',
    clasico: 'Clásico',
    apilado: 'Apilado',
    doble: 'Doble',
    densidad: 'Densidad',
    compacta: 'Compacta',
    normal: 'Normal',
    amplia: 'Amplia',
    idioma: 'Idioma',
    display: 'Display',
    /* tabla */
    th_player: 'Jugador',
    th_pj: 'PJ',
    th_points: 'Puntos',
    th_avg: 'Puesto prom.',
    th_win: 'Ganadas%',
    th_dealin: 'Ron%',
    th_riichi: 'Riichi%',
    th_open: 'Abiertas%',
    th_form: 'Forma',
    zone_playoff: '1-8 Eliminatorias',
    zone_iormc: '★ Top 4 chileno → IORMC',
    zone_relegation: '21-24 Descenso',
    zone_promotion: '1-8 Eliminatorias',
    zone_bottom: '21-24 Zona baja',
    points: 'Puntos',
    avg_rank: 'Puesto promedio',
    win_rate: 'Manos ganadas',
    deal_in: 'Ron pagado',
    riichi: 'Manos con riichi',
    open: 'Manos abiertas',
    con_datos: 'con datos',
    stats_pending: 'stats pendientes',
    /* rail */
    next_match: 'Próxima Partida',
    next_unscheduled: 'Próxima sesión no programada',
    next_waiting: 'Esperando inicio de próxima sesión',
    last_hanchan: 'Últimas Hanchan',
    season: 'Temporada',
    sessions_lbl: 'Sesiones',
    hanchan_div: 'Hanchan Div {div}',
    players_lbl: 'Jugadores',
    per_session: 'Por sesión',
    season_progress: 'SESIÓN {played} DE {total} · {pct}%',
    iormc_selection: 'Selección IORMC',
    cut_margin: 'Corte {cut} · margen {gap}',
    other_division: 'Otra División',
    hanchan: 'hanchan',
    of_rank: 'de {n} · Div {div}',
    iormc_qualified: 'Clasificado IORMC · cupo {n}',
    iormc_contention: 'En carrera IORMC · {n}° chileno',
    iormc_out: '{n}° chileno de División A',
    iormc_cut_line: 'Top 4 chileno de División A · corte {cut}',
    zone_playoff: '1-8 Eliminatorias',
    zone_releg: 'Zona de Descenso a División B',
    zone_promo: 'Zona de Promoción a División A',
    zone_bottom: 'Zona baja de División B',
    lbl_avgrank: 'Puesto promedio',
    lbl_avgpts: 'Puntos por hanchan',
    lbl_winrate: 'Manos ganadas',
    lbl_dealin: 'Ron pagado',
    lbl_riichi: 'Manos con riichi',
    lbl_open: 'Manos abiertas',
    lbl_damaten: 'Victorias en damaten',
    lbl_winpts: 'Puntos por victoria',
    lbl_dealinpts: 'Puntos pagados por ron',
    lbl_winturn: 'Turno promedio de victoria',
    stats_overview: 'Resumen estadístico',
    stats_overview_hint: 'Métricas agrupadas por objetivo. Selecciona una para ver cómo se calcula.',
    stats_results: 'Resultados',
    stats_efficiency: 'Eficiencia',
    stats_style: 'Estilo de juego',
    stats_value_speed: 'Valor y velocidad',
    radar_wins: 'Victorias',
    radar_defense: 'Defensa',
    radar_riichi: 'Riichi',
    radar_open: 'Apertura',
    radar_placement: 'Posición',
    radar_points: 'Puntos',
    radar_summary: 'Lectura general',
    /* tooltips de stats: fórmula, nota y muestra */
    fx_avgrank: 'suma de puestos / hanchan con puesto',
    fx_avgpts: 'puntos de liga / hanchan jugadas',
    fx_winrate: 'manos ganadas / manos jugadas',
    fx_dealin: 'manos en que pagaste el ron / manos jugadas',
    fx_riichi: 'manos con riichi declarado / manos jugadas',
    fx_open: 'manos con llamada / manos jugadas',
    fx_open_note: 'El kan cerrado no cuenta: la mano sigue menzen.',
    fx_damaten: 'manos ganadas en menzen sin riichi / manos ganadas',
    fx_damaten_note: 'Damaten = mano cerrada y lista, sin cantar riichi.',
    fx_winpts: 'puntos de tus manos ganadas / manos ganadas',
    fx_dealinpts: 'puntos que pagaste por ron / manos en que pagaste',
    fx_points_note: 'Valor de la mano: sin palos de riichi ni honba.',
    fx_winturn: 'turno propio al ganar / manos ganadas',
    fx_winturn_note: 'Junme: cuántas fichas alcanzaste a robar en esa mano.',
    den_hands: 'manos jugadas',
    den_wins: 'manos ganadas',
    den_dealins: 'ron pagado',
    den_games: 'hanchan',
    den_played: 'hanchan con puesto',
    st_sample_ratio: '{num} de {den} {unit}',
    st_sample_plain: 'sobre {den} {unit}',
    st_small_sample: 'muestra chica',
    st_context: 'Div {div} · #{rank} de {total} · mediana {median}',
    placement_title: 'Distribución de Puestos',
    profile_title: 'Estilo de juego',
    evolution_title: 'Evolución de Puntos',
    chart_current: 'Puntaje actual',
    chart_peak: 'Puntaje máximo',
    chart_best_game: 'Mejor partida',
    chart_game_axis: 'Número de partida',
    chart_point_title: 'Partida {n}: {points} puntos acumulados',
    chart_aria: 'Evolución en {n} partidas; puntaje actual {points}',
    yaku_title: 'Yakus Jugados',
    camino_iormc: 'Camino al IORMC',
    io_cupos: '{slots} cupos · {eligible} chilenos en División A',
    cupo_lbl: 'Cupo {n}',
    iormc_meta: '#{rank} División A · {games} hanchan',
    carrera_chilena: 'Carrera chilena · División A',
    iormc_cut_lbl: 'Corte · {cut}',
    margen_corte: 'Margen del corte',
    cut_stat_lb: 'puntos entre el 4° y el 5° chileno',
    dentro_lbl: 'Dentro · 4°',
    fuera_lbl: 'Fuera · 5°',
    cut_note: 'Queda {s} sesión · {h} hanchan por jugador',
    comp_liga: 'Composición de la liga',
    cara_a_cara: 'Cara a Cara',
    inter_division: 'Inter-división',
    historial_title: 'Historial de Hanchan',
    calendario_title: 'Calendario de Temporada',
    records_title: 'Hall of Fame',
    hof_leader_title: 'Líder de división',
    hof_leader_subtitle: 'puntos de liga',
    hof_wins_title: 'Mayor porcentaje de victorias',
    hof_wins_subtitle: 'manos ganadas',
    hof_defense_title: 'Mejor defensa',
    hof_defense_subtitle: 'menor porcentaje de ron pagado',
    hof_riichi_title: 'Más manos con riichi',
    hof_riichi_subtitle: 'porcentaje de manos con riichi',
    hof_consistency_title: 'Mayor consistencia',
    hof_consistency_subtitle: 'mejor puesto promedio',
    hof_recent_title: 'Mejor rendimiento reciente',
    hof_recent_subtitle: 'puntos en los últimos 4 hanchan',
    top_rate: 'Primeros puestos',
    perfil: 'Perfil',
    liga_lbl: 'Liga',
    records_count: '{n} registros',
    view_paipu: 'Ver paipu ↗',
    mesa: 'Mesa {n}',
    log_count: '{shown} de {total} hanchan',
    cal_subtitle: '{total} sesiones · {per} hanchan cada una',
    next_cal: 'Próximo',
    played_sessions: 'Sesiones Jugadas',
    metrics_note: 'Barra más larga = mejor, escalada al rango de la liga',
    metrics_title: 'Métricas',
    timezone: 'Zona horaria',
    tz_base: 'Sede',
    tz_base_hint: 'Zona base de la liga: los horarios oficiales se publican en esta hora',
    dia_sig: 'Día siguiente',
    dia_ant: 'Día anterior',
    partida_n: 'Partida de {n} jugadores',
    hora_local: 'Hora local',
    all_times: 'Todos los horarios',
    por_definir: 'Por definir',
  },

  en: {
    all: "All",
    app_title: 'Liga Mahjong Chile',
    app_tagline: 'Riichi · 2026 Season',
    divisiones: 'divisions',
    jugadores: 'players',
    sesiones_noun: 'sessions',
    hanchan_total: '{n} hanchan',
    official_data: 'OFFICIAL DATA',
    division: 'Division {d}',
    leader: 'Leader {name}',
    standings_title: 'Division {div} Standings',
    session_summary: 'Session {played} of {total} · {per} hanchan per session',
    tabla: 'Table',
    jugador: 'Player',
    comparador: 'Compare',
    historial: 'History',
    iormc: 'IORMC',
    calendario: 'Calendar',
    records: 'Records',
    tweaks_title: 'Settings',
    tema: 'Theme',
    estilo: 'Style',
    disposicion_str: 'Layout',
    oscuro: 'Dark mode',
    clasico: 'Classic',
    apilado: 'Stacked',
    doble: 'Split',
    densidad: 'Density',
    compacta: 'Compact',
    normal: 'Regular',
    amplia: 'Comfy',
    idioma: 'Language',
    display: 'Display',
    th_player: 'Player',
    th_pj: 'GP',
    th_points: 'Points',
    th_avg: 'Avg #',
    th_win: 'Win%',
    th_dealin: 'Deal-in%',
    th_riichi: 'Riichi%',
    th_open: 'Open%',
    th_form: 'Form',
    zone_playoff: '1-8 Playoffs',
    zone_iormc: '★ Top 4 Chilean → IORMC',
    zone_relegation: '21-24 Relegation',
    zone_promotion: '1-8 Playoffs',
    zone_bottom: '21-24 Bottom zone',
    points: 'Points',
    avg_rank: 'Avg Rank',
    win_rate: 'Win Rate',
    deal_in: 'Deal-in',
    riichi: 'Riichi',
    open: 'Open',
    con_datos: 'with data',
    stats_pending: 'stats pending',
    next_match: 'Next Game',
    next_unscheduled: 'Next session not scheduled',
    next_waiting: 'Waiting for the next session to start',
    last_hanchan: 'Last Hanchan',
    season: 'Season',
    sessions_lbl: 'Sessions',
    hanchan_div: 'Hanchan Div {div}',
    players_lbl: 'Players',
    per_session: 'Per session',
    season_progress: 'SESSION {played} OF {total} · {pct}%',
    iormc_selection: 'IORMC Selection',
    cut_margin: 'Cut {cut} · margin {gap}',
    other_division: 'Other Division',
    hanchan: 'hanchan',
    of_rank: 'of {n} · Div {div}',
    iormc_qualified: 'Qualified for IORMC · slot {n}',
    iormc_contention: 'In IORMC contention · {n}th Chilean',
    iormc_out: '{n}th Chilean from Division A',
    iormc_cut_line: 'Top 4 Chilean from Division A · cut {cut}',
    zone_playoff: '1-8 Playoffs',
    zone_releg: 'Relegation zone to Division B',
    zone_promo: 'Promotion zone to Division A',
    zone_bottom: 'Division B bottom zone',
    lbl_avgrank: 'Average placement',
    lbl_avgpts: 'Points per hanchan',
    lbl_winrate: 'Hands won',
    lbl_dealin: 'Deal-ins',
    lbl_riichi: 'Riichi hands',
    lbl_open: 'Open hands',
    lbl_damaten: 'Damaten wins',
    lbl_winpts: 'Points per win',
    lbl_dealinpts: 'Points lost per deal-in',
    lbl_winturn: 'Average winning turn',
    stats_overview: 'Statistics overview',
    stats_overview_hint: 'Metrics grouped by purpose. Select one to see how it is calculated.',
    stats_results: 'Results',
    stats_efficiency: 'Efficiency',
    stats_style: 'Playing style',
    stats_value_speed: 'Value and speed',
    radar_wins: 'Wins',
    radar_defense: 'Defense',
    radar_riichi: 'Riichi',
    radar_open: 'Open',
    radar_placement: 'Placement',
    radar_points: 'Points',
    radar_summary: 'At a glance',
    /* stat tooltips: formula, note and sample */
    fx_avgrank: 'sum of placements / ranked hanchan',
    fx_avgpts: 'league points / hanchan played',
    fx_winrate: 'won hands / hands played',
    fx_dealin: 'hands you paid the ron / hands played',
    fx_riichi: 'hands with riichi declared / hands played',
    fx_open: 'hands with a call / hands played',
    fx_open_note: 'A closed kan does not count: the hand stays menzen.',
    fx_damaten: 'closed hands won without riichi / won hands',
    fx_damaten_note: 'Dama = closed and ready hand, riichi never declared.',
    fx_winpts: 'points of your winning hands / won hands',
    fx_dealinpts: 'points paid on ron / hands you paid',
    fx_points_note: 'Hand value: riichi sticks and honba excluded.',
    fx_winturn: 'own turn when winning / won hands',
    fx_winturn_note: 'Junme: how many tiles you had drawn in that hand.',
    den_hands: 'hands played',
    den_wins: 'won hands',
    den_dealins: 'deal-ins',
    den_games: 'hanchan',
    den_played: 'ranked hanchan',
    st_sample_ratio: '{num} of {den} {unit}',
    st_sample_plain: 'over {den} {unit}',
    st_small_sample: 'small sample',
    st_context: 'Div {div} · #{rank} of {total} · median {median}',
    placement_title: 'Placement Distribution',
    profile_title: 'Play Style',
    evolution_title: 'Points Evolution',
    chart_current: 'Current score',
    chart_peak: 'Peak score',
    chart_best_game: 'Best game',
    chart_game_axis: 'Game number',
    chart_point_title: 'Game {n}: {points} cumulative points',
    chart_aria: 'Progress across {n} games; current score {points}',
    yaku_title: 'Yaku Played',
    camino_iormc: 'Road to IORMC',
    io_cupos: '{slots} slots · {eligible} Chileans in Division A',
    cupo_lbl: 'Slot {n}',
    iormc_meta: '#{rank} Division A · {games} hanchan',
    carrera_chilena: 'Chilean race · Division A',
    iormc_cut_lbl: 'Cut · {cut}',
    margen_corte: 'Cut margin',
    cut_stat_lb: 'points between the 4th and 5th Chilean',
    dentro_lbl: 'In · 4th',
    fuera_lbl: 'Out · 5th',
    cut_note: '{s} session left · {h} hanchan per player',
    comp_liga: 'League composition',
    cara_a_cara: 'Head to Head',
    inter_division: 'Cross-division',
    historial_title: 'Hanchan History',
    calendario_title: 'Season Calendar',
    records_title: 'Hall of Fame',
    hof_leader_title: 'Division leader',
    hof_leader_subtitle: 'league points',
    hof_wins_title: 'Highest win rate',
    hof_wins_subtitle: 'hands won',
    hof_defense_title: 'Best defense',
    hof_defense_subtitle: 'lowest deal-in rate',
    hof_riichi_title: 'Most riichi hands',
    hof_riichi_subtitle: 'percentage of riichi hands',
    hof_consistency_title: 'Most consistent',
    hof_consistency_subtitle: 'best average placement',
    hof_recent_title: 'Best recent performance',
    hof_recent_subtitle: 'points across the last 4 hanchan',
    top_rate: 'First-place rate',
    perfil: 'Profile',
    liga_lbl: 'League',
    records_count: '{n} records',
    view_paipu: 'View paipu ↗',
    mesa: 'Table {n}',
    log_count: '{shown} of {total} hanchan',
    cal_subtitle: '{total} sessions · {per} hanchan each',
    next_cal: 'Next',
    played_sessions: 'Played Sessions',
    metrics_note: 'Longer bar = better, scaled to league range',
    metrics_title: 'Metrics',
    timezone: 'Time zone',
    tz_base: 'Home',
    tz_base_hint: 'League base zone: official times are published in this zone',
    dia_sig: 'Next day',
    dia_ant: 'Previous day',
    partida_n: 'Game of {n} players',
    hora_local: 'Local time',
    all_times: 'All times',
    por_definir: 'To be defined',
  },

  pt: {
    all: "Todas",
    app_title: 'Liga Mahjong Chile',
    app_tagline: 'Riichi · Temporada 2026',
    divisiones: 'divisões',
    jugadores: 'jogadores',
    sesiones_noun: 'sessões',
    hanchan_total: '{n} hanchan',
    official_data: 'DADOS OFICIAIS',
    division: 'Divisão {d}',
    leader: 'Líder {name}',
    standings_title: 'Classificação Divisão {div}',
    session_summary: 'Sessão {played} de {total} · {per} hanchan por sessão',
    tabla: 'Tabela',
    jugador: 'Jogador',
    comparador: 'Comparar',
    historial: 'Histórico',
    iormc: 'IORMC',
    calendario: 'Calendário',
    records: 'Recordes',
    tweaks_title: 'Configurações',
    tema: 'Tema',
    estilo: 'Estilo',
    disposicion_str: 'Disposição',
    oscuro: 'Modo escuro',
    clasico: 'Clássico',
    apilado: 'Empilhado',
    doble: 'Duplo',
    densidad: 'Densidade',
    compacta: 'Compacta',
    normal: 'Normal',
    amplia: 'Ampla',
    idioma: 'Idioma',
    display: 'Display',
    th_player: 'Jogador',
    th_pj: 'JO',
    th_points: 'Pontos',
    th_avg: 'Posição méd.',
    th_win: 'Ganhas%',
    th_dealin: 'Rons%',
    th_riichi: 'Riichi%',
    th_open: 'Abertas%',
    th_form: 'Forma',
    zone_playoff: '1-8 Eliminatórias',
    zone_iormc: '★ Top 4 chileno → IORMC',
    zone_relegation: '21-24 Rebaixamento',
    zone_promotion: '1-8 Eliminatórias',
    zone_bottom: '21-24 Zona baixa',
    points: 'Pontos',
    avg_rank: 'Posição média',
    win_rate: 'Mãos ganhas',
    deal_in: 'Rons pagos',
    riichi: 'Mãos com riichi',
    open: 'Mãos abertas',
    con_datos: 'com dados',
    stats_pending: 'stats pendentes',
    next_match: 'Próxima Partida',
    next_unscheduled: 'Próxima sessão não programada',
    next_waiting: 'Aguardando o início da próxima sessão',
    last_hanchan: 'Últimos Hanchan',
    season: 'Temporada',
    sessions_lbl: 'Sessões',
    hanchan_div: 'Hanchan Div {div}',
    players_lbl: 'Jogadores',
    per_session: 'Por sessão',
    season_progress: 'SESSÃO {played} DE {total} · {pct}%',
    iormc_selection: 'Seleção IORMC',
    cut_margin: 'Corte {cut} · margem {gap}',
    other_division: 'Outra Divisão',
    hanchan: 'hanchan',
    of_rank: 'de {n} · Div {div}',
    iormc_qualified: 'Classificado para o IORMC · vaga {n}',
    iormc_contention: 'Na disputa pelo IORMC · {n}º chileno',
    iormc_out: '{n}º chileno da Divisão A',
    iormc_cut_line: 'Top 4 chileno da Divisão A · corte {cut}',
    zone_playoff: '1-8 Eliminatórias',
    zone_releg: 'Zona de Rebaixamento para a Divisão B',
    zone_promo: 'Zona de Promoção para a Divisão A',
    zone_bottom: 'Zona baixa da Divisão B',
    lbl_avgrank: 'Posição média',
    lbl_avgpts: 'Pontos por hanchan',
    lbl_winrate: 'Mãos ganhas',
    lbl_dealin: 'Rons pagos',
    lbl_riichi: 'Mãos com riichi',
    lbl_open: 'Mãos abertas',
    lbl_damaten: 'Vitórias em damaten',
    lbl_winpts: 'Pontos por vitória',
    lbl_dealinpts: 'Pontos pagos por ron',
    lbl_winturn: 'Turno médio da vitória',
    stats_overview: 'Resumo estatístico',
    stats_overview_hint: 'Métricas agrupadas por objetivo. Selecione uma para ver como é calculada.',
    stats_results: 'Resultados',
    stats_efficiency: 'Eficiência',
    stats_style: 'Estilo de jogo',
    stats_value_speed: 'Valor e velocidade',
    radar_wins: 'Vitórias',
    radar_defense: 'Defesa',
    radar_riichi: 'Riichi',
    radar_open: 'Abertura',
    radar_placement: 'Posição',
    radar_points: 'Pontos',
    radar_summary: 'Visão geral',
    /* tooltips das stats: fórmula, nota e amostra */
    fx_avgrank: 'soma das posições / hanchan com posição',
    fx_avgpts: 'pontos de liga / hanchan jogadas',
    fx_winrate: 'mãos ganhas / mãos jogadas',
    fx_dealin: 'mãos em que pagou o ron / mãos jogadas',
    fx_riichi: 'mãos com riichi declarado / mãos jogadas',
    fx_open: 'mãos com chamada / mãos jogadas',
    fx_open_note: 'O kan fechado não conta: a mão segue menzen.',
    fx_damaten: 'mãos ganhas em menzen sem riichi / mãos ganhas',
    fx_damaten_note: 'Damaten = mão fechada e pronta, sem cantar riichi.',
    fx_winpts: 'pontos das suas mãos ganhas / mãos ganhas',
    fx_dealinpts: 'pontos pagos por ron / mãos em que pagou',
    fx_points_note: 'Valor da mão: sem palitos de riichi nem honba.',
    fx_winturn: 'turno próprio ao ganhar / mãos ganhas',
    fx_winturn_note: 'Junme: quantas peças alcançou a comprar nessa mão.',
    den_hands: 'mãos jogadas',
    den_wins: 'mãos ganhas',
    den_dealins: 'rons pagos',
    den_games: 'hanchan',
    den_played: 'hanchan com posição',
    st_sample_ratio: '{num} de {den} {unit}',
    st_sample_plain: 'sobre {den} {unit}',
    st_small_sample: 'amostra pequena',
    st_context: 'Div {div} · #{rank} de {total} · mediana {median}',
    placement_title: 'Distribuição de Posições',
    profile_title: 'Estilo de Jogo',
    evolution_title: 'Evolução de Pontos',
    chart_current: 'Pontuação atual',
    chart_peak: 'Pontuação máxima',
    chart_best_game: 'Melhor partida',
    chart_game_axis: 'Número da partida',
    chart_point_title: 'Partida {n}: {points} pontos acumulados',
    chart_aria: 'Evolução em {n} partidas; pontuação atual {points}',
    yaku_title: 'Yakus Jogados',
    camino_iormc: 'Caminho para o IORMC',
    io_cupos: '{slots} vagas · {eligible} chilenos na Divisão A',
    cupo_lbl: 'Vaga {n}',
    iormc_meta: '#{rank} Divisão A · {games} hanchan',
    carrera_chilena: 'Corrida chilena · Divisão A',
    iormc_cut_lbl: 'Corte · {cut}',
    margen_corte: 'Margem do corte',
    cut_stat_lb: 'pontos entre o 4º e o 5º chileno',
    dentro_lbl: 'Dentro · 4º',
    fuera_lbl: 'Fora · 5º',
    cut_note: 'Falta {s} sessão · {h} hanchan por jogador',
    comp_liga: 'Composição da liga',
    cara_a_cara: 'Cara a Cara',
    inter_division: 'Inter-divisão',
    historial_title: 'Histórico de Hanchan',
    calendario_title: 'Calendário da Temporada',
    records_title: 'Hall of Fame',
    hof_leader_title: 'Líder da divisão',
    hof_leader_subtitle: 'pontos da liga',
    hof_wins_title: 'Maior percentual de vitórias',
    hof_wins_subtitle: 'mãos ganhas',
    hof_defense_title: 'Melhor defesa',
    hof_defense_subtitle: 'menor percentual de ron pago',
    hof_riichi_title: 'Mais mãos com riichi',
    hof_riichi_subtitle: 'percentual de mãos com riichi',
    hof_consistency_title: 'Maior consistência',
    hof_consistency_subtitle: 'melhor posição média',
    hof_recent_title: 'Melhor desempenho recente',
    hof_recent_subtitle: 'pontos nos últimos 4 hanchan',
    top_rate: 'Primeiros lugares',
    perfil: 'Perfil',
    liga_lbl: 'Liga',
    records_count: '{n} registros',
    view_paipu: 'Ver paipu ↗',
    mesa: 'Mesa {n}',
    log_count: '{shown} de {total} hanchan',
    cal_subtitle: '{total} sessões · {per} hanchan cada uma',
    next_cal: 'Próximo',
    played_sessions: 'Sessões Jogadas',
    metrics_note: 'Barra mais longa = melhor, escalada à faixa da liga',
    metrics_title: 'Métricas',
    timezone: 'Fuso horário',
    tz_base: 'Sede',
    tz_base_hint: 'Fuso base da liga: os horários oficiais saem neste fuso',
    dia_sig: 'Dia seguinte',
    dia_ant: 'Dia anterior',
    partida_n: 'Partida de {n} jogadores',
    hora_local: 'Hora local',
    all_times: 'Todos os horários',
    por_definir: 'A definir',
  },
};

// ── Zonas horarias de la liga (solo la capital de cada país) ──
// La base del torneo es America/Santiago (Chile). Una opción por país con su
// bandera; el usuario elige la suya desde la barra superior.
// `short` es lo que entra en la píldora de la barra superior; `city` es el
// rótulo completo del desplegable.
window.TZ_OPTIONS = [
  { code: 'CL', nat: 'CL', flag: '🇨🇱', city: 'Santiago', short: 'Santiago', tz: 'America/Santiago' },
  { code: 'UY', nat: 'UY', flag: '🇺🇾', city: 'Montevideo', short: 'Montevideo', tz: 'America/Montevideo' },
  { code: 'AR', nat: 'AR', flag: '🇦🇷', city: 'Buenos Aires', short: 'Buenos Aires', tz: 'America/Argentina/Buenos_Aires' },
  { code: 'PE', nat: 'PE', flag: '🇵🇪', city: 'Lima', short: 'Lima', tz: 'America/Lima' },
  { code: 'BR', nat: 'BR', flag: '🇧🇷', city: 'São Paulo / Brasília', short: 'São Paulo', tz: 'America/Sao_Paulo' },
  { code: 'MX', nat: 'MX', flag: '🇲🇽', city: 'Ciudad de México', short: 'CDMX', tz: 'America/Mexico_City' },
  // Japón no tiene jugadores en la liga: está por el mahjong (y porque las
  // sesiones de noche en Chile caen al día siguiente en Tokio).
  { code: 'JP', nat: 'JP', flag: '🇯🇵', city: 'Tokio', short: 'Tokio', tz: 'Asia/Tokyo' },
];

// Zona base del torneo: los horarios de la liga se publican en esta hora.
window.TZ_BASE = 'America/Santiago';

// Hora de pared actual ("21:40") en una zona cualquiera.
window.tzNow = function (tz, at) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
      .format(at || new Date());
  } catch (e) { return '--:--'; }
};

// País → zona horaria por defecto (para mostrar la hora local de cada participante).
window.NAT_TZ = {
  CL: 'America/Santiago', UY: 'America/Montevideo', AR: 'America/Argentina/Buenos_Aires',
  PE: 'America/Lima', BR: 'America/Sao_Paulo', MX: 'America/Mexico_City', JP: 'Asia/Tokyo',
};

// localStorage puede tirar excepción (modo privado, cookies bloqueadas); si
// falla, la preferencia simplemente no persiste y el sitio sigue funcionando.
function prefGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function prefSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* no persiste */ } }

window.LANG = prefGet('mjc-lang') || 'es';
window.TZ = prefGet('mjc-tz') || 'America/Santiago';
window.setLang = function (l) {
  window.LANG = l;
  prefSet('mjc-lang', l);
  window.dispatchEvent(new CustomEvent('langchange'));
};
window.setTZ = function (tz) {
  window.TZ = tz;
  prefSet('mjc-tz', tz);
  window.dispatchEvent(new CustomEvent('tzchange'));
};
// ── Modo oscuro ──
// Sin preferencia guardada seguimos la del sistema operativo (el patrón
// habitual: prefers-color-scheme). En cuanto el usuario toca el switch su
// elección queda guardada y manda por sobre el sistema, en los dos sentidos:
// se puede fijar claro aunque el SO esté en oscuro.
(function () {
  const KEY = 'mjc-dark';
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const systemDark = () => !!(mq && mq.matches);

  function apply(v) {
    window.DARK = !!v;
    document.documentElement.setAttribute('data-dark', String(window.DARK));
    window.dispatchEvent(new CustomEvent('darkchange'));
  }

  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* modo privado */ }

  // true mientras no haya elección explícita: es lo que habilita seguir al SO en vivo.
  window.DARK_FOLLOWS_SYSTEM = stored !== '0' && stored !== '1';
  window.DARK = window.DARK_FOLLOWS_SYSTEM ? systemDark() : stored === '1';
  document.documentElement.setAttribute('data-dark', String(window.DARK));

  window.setDark = function (v) {
    window.DARK_FOLLOWS_SYSTEM = false;
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* modo privado */ }
    apply(v);
  };

  // Volver a "lo que diga el sistema": borra la preferencia guardada.
  window.clearDarkPreference = function () {
    try { localStorage.removeItem(KEY); } catch (e) { /* modo privado */ }
    window.DARK_FOLLOWS_SYSTEM = true;
    apply(systemDark());
  };

  if (mq) {
    const onSystemChange = (e) => { if (window.DARK_FOLLOWS_SYSTEM) apply(e.matches); };
    // Safari < 14 solo tiene addListener.
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  }
})();

window.tr = function (key, vars) {
  const table = window.I18N[window.LANG] || window.I18N.es;
  let s = table[key] !== undefined ? table[key] : (window.I18N.es[key] !== undefined ? window.I18N.es[key] : key);
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
    }
  }
  return s;
};

// Convierte una hora ("23 ago", "22:00") de la base (America/Santiago) a la
// zona horaria destino y devuelve { time: "22:00", shift: 0 }.
//
// `shift` es la diferencia de día calendario contra la base: +1 si allá ya es
// el día siguiente, −1 si todavía es el anterior. Con las zonas americanas
// siempre daba 0, pero las sesiones son de noche en Chile (19:00–22:00) y en
// Tokio eso cae a la mañana del día siguiente: mostrar "07:00" pelado mandaría
// a un espectador japonés al día equivocado.
window.fmtTzParts = function (dateStr, timeStr, toTZ) {
  const MONTHS = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
  const parts = String(dateStr || '').split(' ');
  const day = parseInt(parts[0], 10), mon = MONTHS[parts[1]];
  const tm = String(timeStr || '').split(':');
  const h = parseInt(tm[0], 10), mi = parseInt(tm[1], 10);
  const fallback = { time: timeStr || 'Por definir', shift: 0 };
  if (isNaN(day) || mon === undefined || isNaN(h)) return fallback;
  const year = new Date().getFullYear();
  const fromTZ = 'America/Santiago';
  // instante UTC cuya hora de pared en fromTZ es (day, mon, h:mi) — 2 pasos sufren
  let utc = Date.UTC(year, mon, day, h, mi);
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: fromTZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(dtf.formatToParts(new Date(utc)).map(x => [x.type, x.value]));
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    utc += (Date.UTC(year, mon, day, h, mi) - wall);
  }
  try {
    const at = new Date(utc);
    const tz = toTZ || fromTZ;
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
    // 'en-CA' da YYYY-MM-DD, así que comparar como texto ordena bien incluso
    // cruzando fin de año.
    const dayIn = (z) => new Intl.DateTimeFormat('en-CA', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
    const base = dayIn(fromTZ), local = dayIn(tz);
    return { time, shift: local === base ? 0 : (local > base ? 1 : -1) };
  } catch (e) {
    return fallback;
  }
};
