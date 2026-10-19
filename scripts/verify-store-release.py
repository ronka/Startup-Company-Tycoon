"""Read back App Store Connect metadata and compare image checksums with local files."""
import hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
version='e8b8b98b-b5fb-4682-96de-aa298bab0b34'
def asc(*args):return json.loads(subprocess.run(['asc',*args],capture_output=True,text=True,check=True).stdout)
config=json.loads((root/'store.config.json').read_text())['apple']['info']
versions=asc('localizations','list','--version',version)['data']
infos=asc('localizations','list','--app','6787488376','--type','app-info','--app-info','e01633cc-c1e3-41ba-9291-fa08df438a24')['data']
by_locale={x['attributes']['locale']:x['attributes'] for x in infos}
report={'version':'1.1.0','buildNumber':'11','locales':{},'complete':True}
for row in versions:
 a=row['attributes'];locale=a['locale'];expected=config[locale]
 for source,dest in [('description','description'),('keywords','keywords'),('releaseNotes','whatsNew'),('promoText','promotionalText'),('supportUrl','supportUrl'),('marketingUrl','marketingUrl')]:
  value=','.join(expected[source]) if source=='keywords' else expected[source]
  assert a.get(dest)==value,(locale,dest)
 for source,dest in [('title','name'),('subtitle','subtitle'),('privacyPolicyUrl','privacyPolicyUrl')]:assert by_locale[locale].get(dest)==expected[source],(locale,dest)
 sets=asc('screenshots','list','--version-localization',row['id'])['sets']
 result={}
 for group in sets:
  device=group['set']['attributes']['screenshotDisplayType']
  if device not in expected['screenshots']:continue
  screenshots=group['screenshots']
  ordered_names=[Path(x).name for x in expected['screenshots'][device]]
  names=[x['attributes']['fileName'] for x in screenshots]
  checksums={Path(x).name:hashlib.md5((root/x).read_bytes()).hexdigest() for x in expected['screenshots'][device]}
  states=[x['attributes'].get('assetDeliveryState',{}).get('state') for x in screenshots]
  matching=sum(x['attributes'].get('sourceFileChecksum')==checksums.get(x['attributes']['fileName']) for x in screenshots)
  okay=names==ordered_names and states==['COMPLETE']*6 and matching==6
  result[device]={'count':len(screenshots),'completeCount':states.count('COMPLETE'),'checksumMatches':matching,'orderCorrect':names==ordered_names,'verified':okay}
  if not okay:report['complete']=False
 if len(result)!=2:report['complete']=False
 report['locales'][locale]={'metadataVerified':True,'screenshots':result}
 print(locale,json.dumps(result),flush=True)
assert set(report['locales'])==set(config)
(root/'store/2026-10-18-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print('ALL VERIFIED' if report['complete'] else 'Screenshot upload or processing is still in progress.',flush=True)
raise SystemExit(0 if report['complete'] else 1)
