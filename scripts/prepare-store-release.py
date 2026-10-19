"""Prepare localized EAS store metadata and frozen iPhone screenshots for 1.1.0."""
import json, shutil
from PIL import Image
from pathlib import Path
root=Path(__file__).resolve().parent.parent
p=root/'store.config.json'
s=json.loads(p.read_text())
base=s['apple']['info']['en-US']
locales={
'en-US':dict(source='en',subtitle='Business & CEO Simulator',
keywords='company,management,entrepreneur,venture,capital,office,strategy,finance,founder,ipo,investing',
promo='Build a startup from the ground up. Hire your team, outsmart rivals, raise capital, and make every week count on the road to an IPO.',
notes='Your startup has a new home.\n\n- Watch your team at work in a living office that grows with your company.\n- Learn the ropes with guided first-week missions.\n- Find your key numbers faster in refreshed HQ, Team, Money, and Market screens.\n- See when your next free week is ready with a clearer countdown.\n- Keep an eye on your company with home screen widgets.',
description='''Build your startup empire, one decision at a time.

Startup Empire Tycoon is a business simulation game where you become the founder and CEO of a tech company. Hire your team, win customers, raise venture capital, and fight to keep the company alive. Every week brings a new call to make.

BUILD A COMPANY WORTH BETTING ON
Start small and watch your office grow with your business. Track cash, revenue, valuation, and runway as your company finds its footing.

HIRE YOUR DREAM TEAM
Recruit developers, sales staff, and support specialists. Fill your CTO, CMO, and CFO seats with leaders whose perks shape your strategy. Balance payroll, morale, and growth.

OUTSMART YOUR RIVALS
Compete against two rival companies for customers. Choose your focus: core product, AI, hardware, or hype. Ride market trends and adapt when the tide turns.

RAISE CAPITAL. PLAN YOUR EXIT.
Negotiate Seed, Series A, and Series B funding. More cash means more room to grow, but each round costs equity. Aim for an acquisition or take your company public.

MAKE THE WEEKLY CALLS
Handle startup events, tradeoffs, and surprises. Guided missions help new founders get started. Free play weeks replenish over time, with optional in-app purchases for extra weeks.

YOUR COMPANY AT A GLANCE
Follow your valuation, check your team's morale, and keep company stats close with home screen widgets. Compare your results on the optional leaderboard.

How far can you take your company?

Game interface and in-game text are currently in English.'''),
'es-ES':dict(source='es',subtitle='Simulador de negocios y CEO',
keywords='empresa,gestión,emprendedor,inversión,capital,oficina,estrategia,finanzas,fundador,bolsa',
promo='Crea una startup desde cero. Forma tu equipo, supera a tus rivales y consigue inversión. Cada semana cuenta en tu camino hacia la bolsa.',
notes='Tu startup estrena sede.\n\n- Observa a tu equipo en una oficina que crece con tu empresa.\n- Aprende con misiones guiadas durante las primeras semanas.\n- Consulta tus cifras clave en las pantallas renovadas de sede, equipo, dinero y mercado.\n- Descubre cuándo estará disponible tu próxima semana gratis con una cuenta atrás más clara.\n- Sigue tu empresa con widgets en la pantalla de inicio.',
description='''Construye tu imperio startup, decisión a decisión.

Startup Empire Tycoon es un juego de simulación empresarial en el que te conviertes en fundador y CEO de una empresa tecnológica. Contrata a tu equipo, gana clientes, consigue capital riesgo y lucha por mantener la empresa a flote. Cada semana trae una nueva decisión.

CREA UNA EMPRESA CON FUTURO
Empieza a pequeña escala y observa cómo crece tu oficina junto con tu negocio. Controla el efectivo, los ingresos, la valoración y las semanas de margen que te quedan.

FORMA TU EQUIPO IDEAL
Contrata desarrolladores y personal de ventas y soporte. Incorpora un CTO, un CMO y un CFO cuyas ventajas influyan en tu estrategia. Equilibra salarios, motivación y crecimiento.

SUPERA A TUS RIVALES
Compite con dos empresas rivales por los clientes. Apuesta por el producto principal, la IA, el hardware o el hype. Aprovecha las tendencias del mercado y adáptate cuando cambien.

CONSIGUE INVERSIÓN. PLANEA TU SALIDA.
Negocia rondas semilla, Serie A y Serie B. Más capital te permite crecer, pero cada ronda reduce tu participación. Busca una adquisición o lleva tu empresa a bolsa.

DECIDE SEMANA A SEMANA
Afronta eventos, dilemas y sorpresas del mundo startup. Las misiones guiadas ayudan a empezar. Las semanas de juego gratuitas se recuperan con el tiempo; puedes comprar semanas extra de forma opcional dentro del juego.

TU EMPRESA DE UN VISTAZO
Sigue tu valoración, comprueba la motivación del equipo y consulta tus cifras con widgets en la pantalla de inicio. Compara tus resultados en la clasificación opcional.

¿Hasta dónde puedes llevar tu empresa?

La interfaz y los textos del juego están actualmente en inglés.'''),
'de-DE':dict(source='de',subtitle='Wirtschafts- & Firmensimulator',
keywords='unternehmen,management,gründer,investition,kapital,büro,strategie,finanzen,chef,börse,aufbau',
promo='Gründe dein Startup. Stelle dein Team zusammen, überhole Rivalen und sichere Kapital. Jede Woche zählt auf deinem Weg an die Börse.',
notes='Dein Startup bekommt ein neues Zuhause.\n\n- Beobachte dein Team in einem lebendigen Büro, das mit deiner Firma wächst.\n- Lerne den Einstieg mit geführten Missionen in den ersten Wochen.\n- Finde wichtige Zahlen schneller in den überarbeiteten Ansichten für Zentrale, Team, Finanzen und Markt.\n- Ein klarerer Countdown zeigt, wann deine nächste kostenlose Spielwoche bereitsteht.\n- Behalte deine Firma mit Widgets auf dem Home-Bildschirm im Blick.',
description='''Baue dein Startup-Imperium auf. Eine Entscheidung nach der anderen.

Startup Empire Tycoon ist eine Wirtschaftssimulation, in der du Gründer und CEO einer Tech-Firma wirst. Stelle dein Team ein, gewinne Kunden, sichere Risikokapital und halte dein Unternehmen am Leben. Jede Woche steht eine neue Entscheidung an.

BAUE EIN UNTERNEHMEN MIT ZUKUNFT
Fange klein an und erlebe, wie dein Büro mit deiner Firma wächst. Behalte Kassenbestand, Umsatz, Firmenwert und finanzielle Reichweite im Blick.

FINDE DEIN DREAM-TEAM
Stelle Entwickler sowie Vertriebs- und Supportmitarbeiter ein. Besetze CTO-, CMO- und CFO-Positionen mit Führungskräften, deren Vorteile deine Strategie prägen. Bringe Gehälter, Stimmung und Wachstum ins Gleichgewicht.

ÜBERHOLE DEINE RIVALEN
Kämpfe mit zwei Konkurrenzfirmen um Kunden. Setze auf dein Kernprodukt, KI, Hardware oder Hype. Nutze Markttrends und passe dich an, wenn sich der Wind dreht.

SICHERE KAPITAL. PLANE DEN EXIT.
Verhandle Seed-, Series-A- und Series-B-Finanzierungen. Frisches Kapital schafft Spielraum, kostet aber Firmenanteile. Arbeite auf eine Übernahme hin oder bringe deine Firma an die Börse.

TRIFF DIE WÖCHENTLICHEN ENTSCHEIDUNGEN
Meistere Startup-Ereignisse, Zielkonflikte und Überraschungen. Geführte Missionen erleichtern den Einstieg. Kostenlose Spielwochen laden sich mit der Zeit wieder auf. Zusätzliche Wochen sind optional per In-App-Kauf erhältlich.

DEINE FIRMA AUF EINEN BLICK
Verfolge den Firmenwert, prüfe die Stimmung im Team und sieh wichtige Zahlen in Widgets auf dem Home-Bildschirm. Vergleiche deine Ergebnisse in der optionalen Rangliste.

Wie weit kannst du deine Firma bringen?

Die Benutzeroberfläche und die Spieltexte sind derzeit auf Englisch.'''),
'fr-FR':dict(source='fr',subtitle='Simulation de gestion et PDG',
keywords='entreprise,entrepreneur,investissement,capital,bureau,stratégie,finance,fondateur,bourse,patron',
promo='Crée ta startup. Recrute ton équipe, dépasse tes rivaux et lève des fonds. Chaque semaine compte sur la route de la Bourse.',
notes='Ta startup a un nouveau QG.\n\n- Observe ton équipe dans un bureau vivant qui grandit avec ton entreprise.\n- Apprends les bases avec des missions guidées pendant les premières semaines.\n- Retrouve tes chiffres clés dans les écrans repensés du QG, de l’équipe, des finances et du marché.\n- Un compte à rebours plus clair indique quand ta prochaine semaine gratuite sera disponible.\n- Garde un œil sur ton entreprise avec les widgets de l’écran d’accueil.',
description='''Bâtis ton empire startup, une décision à la fois.

Startup Empire Tycoon est un jeu de simulation de gestion où tu deviens le fondateur et le PDG d’une entreprise technologique. Recrute ton équipe, gagne des clients, lève du capital-risque et maintiens ton entreprise à flot. Chaque semaine apporte une nouvelle décision.

CRÉE UNE ENTREPRISE PROMETTEUSE
Commence petit et regarde ton bureau grandir avec ton activité. Suis ta trésorerie, tes revenus, ta valorisation et le temps qu’il te reste avant de manquer d’argent.

CRÉE TON ÉQUIPE DE RÊVE
Recrute des développeurs et des spécialistes de la vente et du support. Choisis un CTO, un CMO et un CFO dont les atouts influenceront ta stratégie. Trouve l’équilibre entre salaires, moral et croissance.

DÉPASSE TES RIVAUX
Affronte deux entreprises concurrentes pour attirer les clients. Mise sur le produit, l’IA, le matériel ou le buzz. Profite des tendances du marché et adapte-toi quand elles changent.

LÈVE DES FONDS. PRÉPARE TA SORTIE.
Négocie des levées de fonds en amorçage, en série A et en série B. Plus de capital permet de grandir, mais chaque tour réduit ta participation. Vise un rachat ou une entrée en Bourse.

PRENDS LES DÉCISIONS CHAQUE SEMAINE
Fais face aux événements, aux compromis et aux surprises de la vie d’une startup. Les missions guidées facilitent les débuts. Les semaines de jeu gratuites se rechargent avec le temps. Des semaines supplémentaires sont disponibles en achat intégré facultatif.

TON ENTREPRISE EN UN COUP D’ŒIL
Suis ta valorisation, vérifie le moral de ton équipe et consulte tes chiffres grâce aux widgets de l’écran d’accueil. Compare tes résultats dans le classement facultatif.

Jusqu’où mèneras-tu ton entreprise ?

L’interface et les textes du jeu sont actuellement en anglais.'''),
'pt-BR':dict(source='pt-BR',subtitle='Simulador de negócios e CEO',
keywords='empresa,gestão,empreendedor,investimento,capital,escritório,estratégia,finanças,fundador,bolsa',
promo='Crie sua startup do zero. Monte sua equipe, supere os rivais e capte investimento. Cada semana conta na jornada até a abertura de capital.',
notes='Sua startup está de casa nova.\n\n- Veja sua equipe em um escritório vivo que cresce com a empresa.\n- Aprenda o básico com missões guiadas nas primeiras semanas.\n- Encontre seus números mais rápido nas telas renovadas de sede, equipe, finanças e mercado.\n- Uma contagem regressiva mais clara mostra quando sua próxima semana grátis estará disponível.\n- Acompanhe sua empresa com widgets na tela de início.',
description='''Crie seu império startup, uma decisão de cada vez.

Startup Empire Tycoon é um jogo de simulação de negócios em que você vira fundador e CEO de uma empresa de tecnologia. Contrate sua equipe, conquiste clientes, capte capital de risco e mantenha a empresa de pé. Toda semana traz uma nova decisão.

CONSTRUA UMA EMPRESA PROMISSORA
Comece pequeno e veja seu escritório crescer junto com o negócio. Acompanhe o caixa, a receita, o valor da empresa e o tempo que você tem até o dinheiro acabar.

MONTE SUA EQUIPE DOS SONHOS
Contrate desenvolvedores e profissionais de vendas e suporte. Preencha os cargos de CTO, CMO e CFO com líderes cujas vantagens moldam sua estratégia. Equilibre salários, moral e crescimento.

SUPERE SEUS RIVAIS
Dispute clientes com duas empresas concorrentes. Aposte no produto principal, em IA, hardware ou hype. Aproveite as tendências do mercado e se adapte quando elas mudarem.

CAPTE INVESTIMENTO. PLANEJE SUA SAÍDA.
Negocie rodadas Seed, Série A e Série B. Mais capital dá espaço para crescer, mas cada rodada custa uma parte da empresa. Busque uma aquisição ou abra o capital na bolsa.

DECIDA SEMANA A SEMANA
Encare eventos, dilemas e surpresas da vida de uma startup. Missões guiadas ajudam quem está começando. As semanas grátis de jogo se recarregam com o tempo. Você também pode comprar semanas extras, de forma opcional, dentro do jogo.

SUA EMPRESA EM UM OLHAR
Acompanhe o valor da empresa, confira o moral da equipe e consulte seus números com widgets na tela de início. Compare seus resultados no ranking opcional.

Até onde você consegue levar sua empresa?

A interface e os textos do jogo estão atualmente em inglês.''')}
s['apple']['version']='1.1.0'
s['apple']['info']={}
exports=root/'app-store-screenshots/exports/2026-10-18'
for locale,data in locales.items():
 info={k:base[k] for k in ['title','marketingUrl','supportUrl','privacyPolicyUrl']}
 info.update(subtitle=data['subtitle'],description=data['description'],keywords=data['keywords'].split(','),promoText=data['promo'],releaseNotes=data['notes'],screenshots={})
 for size,device in [('1320x2868','APP_IPHONE_67'),('1284x2778','APP_IPHONE_65')]:
  dest=root/'store/apple/screenshot'/locale/device;dest.mkdir(parents=True,exist_ok=True)
  images=sorted((exports/size/data['source']).glob('*.png'));assert len(images)==6
  for image in images:
   target=dest/image.name
   shutil.copy2(image,target)
   # Canonical RGB encoding for the asset whose original RGBA export stalled in ASC processing.
   if locale=='pt-BR' and device=='APP_IPHONE_65' and image.name=='06-no-device.png':
    with Image.open(target) as source: rgb=source.convert('RGB')
    rgb.save(target,format='PNG',optimize=True)
  info['screenshots'][device]=[str((dest/image.name).relative_to(root)) for image in images]
 assert len(info['title'])<=30 and len(info['subtitle'])<=30
 assert len(info['description'])<=4000 and len(info['promoText'])<=170
 assert len(','.join(info['keywords']))<=100
 s['apple']['info'][locale]=info
 print(locale,{'subtitle':len(info['subtitle']),'keywords':len(','.join(info['keywords'])),'description':len(info['description']),'screenshots':12})
p.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n')
