"""Import a pinned, checksum-verified OpenExerciseDB release, without media."""
import urllib.request, hashlib, sqlite3, json, pathlib
URL='https://github.com/rfivesix/OpenExerciseDB/releases/download/catalog-stable/openexercisedb.db'
SHA='02b40b13fcb2073cbf5f2294aba5cc1106d8efad3e5f6905f603125dd1578a2c'
raw=urllib.request.urlopen(URL).read()
assert hashlib.sha256(raw).hexdigest()==SHA, 'Upstream release changed; review and pin a new checksum before import'
db=sqlite3.connect(':memory:'); db.deserialize(raw); db.row_factory=sqlite3.Row
rows=lambda q: [dict(x) for x in db.execute(q)]
exercises=[]; quarantine=[]
for e in rows("select * from exercises where status='active'"):
    ts=rows("select * from exercise_translations where exercise_id="+str(e['id'])) if str(e['id']).isdigit() else [dict(x) for x in db.execute('select * from exercise_translations where exercise_id=?',(e['id'],))]
    en=next((x for x in ts if x['language_code']=='en'),None)
    muscles=[dict(x) for x in db.execute('select muscle_id,role from exercise_muscles where exercise_id=?',(e['id'],))]
    equipment=[dict(x) for x in db.execute('select equipment_id,kind from exercise_equipment where exercise_id=?',(e['id'],))]
    if not en or not en['description'] or not any(x['role']=='primary' for x in muscles):
        quarantine.append(e['id']); continue
    exercises.append(dict(id='oedb:'+str(e['id']),sourceId=e['id'],slug=e['slug'],name=en['name'],description=en['description'],instructions=en['instructions'],translationStatus=en['status'],reviewStatus='source_only',modality=e['modality'],pattern=e['movement_pattern'],difficulty=e['difficulty'],tracking=e['tracking_type'],loadMode=e['load_mode'],equipment=equipment,muscles=muscles,license=e['upstream_license'],author=e['upstream_license_author'],source=e['upstream_source']))
result=dict(manifest=dict(source='https://github.com/rfivesix/OpenExerciseDB',sha256=SHA,license='CC-BY-SA-4.0',version='202610112340',activeCount=len(exercises),quarantined=quarantine,mediaIncluded=False),exercises=exercises,muscles=rows('select * from muscles'),equipment=rows('select * from equipment'),muscleTranslations=rows("select * from muscle_translations where language_code='en'"))
pathlib.Path('data/exercises.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
print('Imported',len(exercises),'exercises; quarantined',len(quarantine))
