"""Planning-only browser observations; serial commands avoid daemon eval retries."""
import json
import subprocess
import time
from PIL import Image
from pathlib import Path

OUT = Path(__file__).resolve().parent
BASE = ['agent-browser', '--session', 'gym-v12-planning']
rows = []

def run(*args, source=None):
    p = subprocess.run(BASE + list(args), input=source, text=True, capture_output=True, timeout=30)
    if p.returncode:
        raise RuntimeError(p.stderr or p.stdout)
    return p.stdout

def evaluate(source):
    return json.loads(run('eval', '--stdin', source=source))

def exists(selector):
    return evaluate('Boolean([...document.querySelectorAll('+json.dumps(selector)+')].find(e=>e.getClientRects().length))')

def click(selector):
    evaluate('(()=>{const e=[...document.querySelectorAll('+json.dumps(selector)+')].find(x=>x.getClientRects().length);if(!e)throw new Error('+json.dumps('Missing control: ')+ '+ '+json.dumps(selector)+');e.scrollIntoView({block:"nearest"});e.click();return true;})()')
    time.sleep(.3)

def cap(name, scope='.root-phone', shot=False):
    result=evaluate('''(()=>{const e=document.querySelector(%s);return {theme:document.documentElement.dataset.theme,text:e.innerText,controls:[...e.querySelectorAll('button,input,select')].filter(x=>x.getClientRects().length).map(x=>({id:x.id,text:x.innerText||x.getAttribute('aria-label'),value:x.value,data:{...x.dataset}}))}})()''' % json.dumps(scope))
    result['name']=name
    rows.append(result)
    (OUT/'serial-walk.json').write_text(json.dumps(rows,indent=2)+'\n')
    if shot:
        bounds=evaluate('(()=>{const r=document.querySelector('+json.dumps(scope)+').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height}})()')
        full=json.loads(run('screenshot','--full','--screenshot-dir',str(OUT),'--json'))
        temporary=Path(full['data']['path'])
        Image.open(temporary).crop((round(bounds['x']),round(bounds['y']),round(bounds['x']+bounds['w']),round(bounds['y']+bounds['h']))).save(OUT/(result['theme']+'-'+name+'.png'))
        temporary.unlink()

def close():
    for _ in range(6):
        selector=evaluate('''(()=>{const s=[...document.querySelectorAll('[role=dialog]')].find(e=>e.getClientRects().length);if(!s)return null;const b=[...s.querySelectorAll('button')].find(e=>/close/i.test(e.getAttribute('aria-label')||''));return b?'#'+s.id+' [aria-label="'+b.getAttribute('aria-label')+'"]':null})()''')
        if not selector:break
        click(selector)

def back():
    close()
    for _ in range(8):
        if not exists('#lib-deep-layer'):break
        click('#lib-deep-back')

def root(name):
    back()
    if exists('#cal-workout-detail'):click('#cal-detail-back')
    click('.root-phone [data-root-destination="'+name+'"]')

def action(value):
    click('[data-ldr-action="'+value+'"]')

for theme in ['light','dark']:
    run('open','http://127.0.0.1:8765/approved-hybrid.html')
    root('workout')
    click('#root-settings');click('#settings-sheet [data-appearance="'+theme+'"]');cap('appearance');close()
    cap('workout-root',shot=True)
    for day in range(5):click('.day-button[data-day="'+str(day)+'"]');cap('workout-day-'+str(day))
    click('#reset-all');cap('active-overview','#active-phone',True)
    click('#active-phone .set-row');cap('active-set-editor','#active-phone',True);close()
    click('#open-plan-settings');cap('active-plan-settings','#active-phone');close()
    for label in ['View Back Squat trend','Open Back Squat menu']:
        click('#active-phone [aria-label="'+label+'"]');cap(label.lower().replace(' ','-'),'#active-phone');close()
    click('#open-add-exercise');cap('active-exercise-picker','#active-phone');close()
    evaluate("[...document.querySelectorAll('#active-phone button')].find(e=>e.getClientRects().length&&/Add set/.test(e.innerText)).click();true")
    cap('set-action-menu','#active-phone');click('#add-warmup');cap('warmup-before-working','#active-phone')
    click('#complete-current');time.sleep(.25);cap('warmup-committed-no-rest','#active-phone')
    click('#complete-current');time.sleep(.25);cap('working-committed-rest','#active-phone',True)
    if exists('#rest-pause'):
        for selector,name in [('#rest-pause','rest-paused'),('#rest-plus','rest-adjusted'),('#rest-pause','rest-resumed'),('#rest-skip','rest-skipped')]:click(selector);cap(name,'#active-phone')
    root('calendar');cap('calendar-month',shot=True);click('#calendar-info');cap('calendar-key',shot=True);close()
    click('#cal-next-month');cap('calendar-next');click('#cal-previous-month');cap('calendar-previous')
    for date in ['2026-10-07','2026-10-04','2026-10-09','2026-10-10','2026-10-05']:
        if exists('#cal-focused-view'):click('#cal-collapse-day');time.sleep(.6)
        click('#cal-current-panel [data-cal-date="'+date+'"]');time.sleep(.6);cap('calendar-agenda-'+date,shot=date=='2026-10-07')
        if date=='2026-10-07':
            click('#cal-agenda-list button');cap('calendar-planned-strength-detail',shot=True);click('#cal-detail-back')
    click('#cal-next-week [data-cal-focus-date]:first-child');time.sleep(1.1);cap('calendar-adjacent-week');click('#cal-collapse-day');time.sleep(.6);cap('calendar-collapsed')
    root('library');click('#lib-plans-tab');cap('library-plans',shot=True)
    for sel,name in [('#lib-open-filters','plan-filters'),('#lib-open-actions','library-actions')]:click(sel);cap(name);close()
    for pid in ['foundation','strength','beginner','home','running-2k']:
        back();click('[data-lib-plan="'+pid+'"]');cap('library-plan-'+pid,shot=pid=='running-2k')
        if pid=='foundation':
            for act,name in [('edit-plan','strength-editor'),('edit-schedule','schedule-editor'),('archive-plan','archive-confirmation')]:
                action(act);cap(name);click('#lib-deep-back')
        if pid=='beginner':action('preview-activation');cap('starter-activation-preview');click('#lib-deep-back')
        if pid=='running-2k':
            action('edit-running');cap('running-editor',shot=True)
            for kind in ['recovery','long','progression','tempo','intervals','hills','fartlek']:
                click('[data-ldr-action="add-run-session"][data-run-type="'+kind+'"]');cap('running-session-'+kind,shot=kind=='intervals');click('#lib-deep-back')
    back();click('[data-lib-create]');cap('plan-type-chooser',shot=True);action('choose-strength-plan');cap('create-strength');back()
    click('[data-lib-create]');action('choose-running-plan');cap('create-running');back()
    click('#lib-exercises-tab');cap('library-exercises',shot=True)
    for eid in ['back-squat','tempo-goblet']:
        click('[data-lib-exercise="'+eid+'"]');cap('exercise-'+eid);back()
    click('#lib-open-actions');click('[data-lib-action="create-exercise"]');cap('custom-exercise-create');back()
    root('progress');click('#pv2-open-settings');click('[data-pv2-running-state="ready"]')
    for sport in ['all','strength','running']:
        click('[data-pv2-sport="'+sport+'"]');cap('progress-'+sport,shot=True)
        for period in ['4w','12w','all']:click('[data-pv2-range="'+period+'"]');cap('progress-'+sport+'-'+period)
    click('[data-pv2-sport="strength"]')
    for eid in ['squat','bench','plank']:click('[data-pv2-strength="'+eid+'"]');cap('strength-detail-'+eid);close()
    if exists('[data-pv2-recommend]'):click('[data-pv2-recommend]');cap('progress-recommendation');close()
    click('[data-pv2-sport="running"]')
    for eid in ['2.4','10','hm']:
        click('[data-pv2-effort="'+eid+'"]');cap('running-effort-'+eid);close()
        click('[data-pv2-target="'+eid+'"]');cap('running-target-'+eid);close()
    click('#pv2-open-bodyweight');cap('bodyweight-history');close()
    for state in ['empty','sparse','loading','ready']:
        click('#pv2-open-settings');cap('progress-settings');click('[data-pv2-running-state="'+state+'"]');cap('progress-running-'+state)
    # Garmin begins afresh at each route using the prototype's own back control.
    if exists('#garmin-back'):click('#garmin-back')
    if exists('[data-garmin-action="revoke"]'):click('[data-garmin-action="revoke"]')
    cap('garmin-disconnected','#garmin-phone',True)
    click('[data-garmin-action="connect"]');cap('garmin-consent','#garmin-phone',True)
    click('[data-garmin-action="approve-consent"]');cap('garmin-connected','#garmin-phone')
    click('[data-garmin-action="sync"]');cap('garmin-syncing','#garmin-phone');time.sleep(.8);cap('garmin-synced','#garmin-phone')
    click('[data-garmin-action="sync"]');time.sleep(.8);cap('garmin-idempotent','#garmin-phone')
    click('[data-garmin-action="sync-error"]');cap('garmin-error','#garmin-phone');click('#garmin-back')
    for kind in ['outdoor','treadmill']:
        click('[data-garmin-action="import"]');cap('garmin-file-import','#garmin-phone')
        click('[data-garmin-action="preview-fit-'+kind+'"]');cap('garmin-'+kind,'#garmin-phone',True)
        click('[data-garmin-action="match"]');cap('garmin-match-'+kind,'#garmin-phone')
        click('[data-garmin-action="confirm-match"]');cap('garmin-confirmed-'+kind,'#garmin-phone')
    click('[data-garmin-action="revoke"]');cap('garmin-revoked','#garmin-phone')
print(json.dumps({'observations':len(rows),'themes':sorted({r['theme'] for r in rows})}))
