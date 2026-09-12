import requests
import os
import dotenv

dotenv.load_dotenv('e:/Hero_HDD/hero_web/backend/.env')

token = os.environ.get('ILYNC_API_TOKEN')
headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/json'}
base_url = 'https://ilync.tech/api'

# 1. Fetch my-tasks (page 0 to 5)
all_tasks = []
page = 0
while page < 5:
    r = requests.get(f"{base_url}/tasks/my-tasks?taskType=FIBER_TRENCHING_DUCTING_TASK&page={page}&size=50", headers=headers, timeout=10)
    if r.status_code != 200:
        break
    data = r.json().get('data', {})
    content = data.get('content') or data.get('results') or []
    if not content:
        break
    all_tasks.extend(content)
    page += 1
    if page >= data.get('totalPages', 1):
        break

print(f"Total my-tasks fetched across pages: {len(all_tasks)}")

# Print task details
for t in all_tasks:
    t_id = t.get('id')
    code = t.get('taskCode')
    name = t.get('displayName')
    assignee = t.get('assigneeSnapshot', {}).get('name') or t.get('assigneeName')
    
    # Check if this task has execution directly or in children
    r_detail = requests.get(f"{base_url}/tasks/{t_id}", headers=headers, timeout=10)
    det = r_detail.json().get('data', {}) if r_detail.status_code == 200 else {}
    has_exec = 'taskExecution' in det
    exec_obj = det.get('taskExecution')
    
    pits_count = 0
    shots_count = 0
    dates_found = set()
    
    if exec_obj:
        fd = exec_obj.get('fieldData', {})
        tr = fd.get('trenching', {})
        pits = tr.get('pitDetails') or fd.get('pitDetails') or []
        shots = tr.get('hddShot') or fd.get('hddShot') or []
        pits_count = len(pits)
        shots_count = len(shots)
        
        for s in shots:
            if s.get('hddEndTime'): dates_found.add(str(s['hddEndTime'])[:10])
            for dp in s.get('depthCapture', []):
                ca = dp.get('capturedAt') or dp.get('createdAt')
                if ca: dates_found.add(str(ca)[:10])
                
        for p in pits:
            dt = p.get('pitDiggingTime')
            if dt: dates_found.add(str(dt)[:10])
            
    print(f"\nTask: {t_id} | Code: {code} | Name: {name} | Assignee: {assignee}")
    print(f"  Direct taskExecution: {has_exec} | Pits: {pits_count} | Shots: {shots_count} | Dates: {sorted(list(dates_found))}")
    
    # Also check children of this task
    r_child = requests.get(f"{base_url}/tasks/{t_id}/children", headers=headers, timeout=10)
    children = r_child.json().get('data', []) if r_child.status_code == 200 else []
    if children and isinstance(children, list):
        print(f"  Children count: {len(children)}")
        for c in children:
            c_id = c.get('id') or c.get('_id')
            c_code = c.get('taskCode')
            c_name = c.get('displayName')
            c_assignee = c.get('assigneeSnapshot', {}).get('name') or c.get('assigneeName')
            
            r_c_detail = requests.get(f"{base_url}/tasks/{c_id}", headers=headers, timeout=10)
            c_det = r_c_detail.json().get('data', {}) if r_c_detail.status_code == 200 else {}
            c_exec = c_det.get('taskExecution')
            c_pits = 0
            c_shots = 0
            c_dates = set()
            if c_exec:
                c_fd = c_exec.get('fieldData', {})
                c_tr = c_fd.get('trenching', {})
                cp = c_tr.get('pitDetails') or c_fd.get('pitDetails') or []
                cs = c_tr.get('hddShot') or c_fd.get('hddShot') or []
                c_pits = len(cp)
                c_shots = len(cs)
                for s in cs:
                    if s.get('hddEndTime'): c_dates.add(str(s['hddEndTime'])[:10])
                    for dp in s.get('depthCapture', []):
                        ca = dp.get('capturedAt') or dp.get('createdAt')
                        if ca: c_dates.add(str(ca)[:10])
                for p in cp:
                    dt = p.get('pitDiggingTime')
                    if dt: c_dates.add(str(dt)[:10])
            print(f"    Child: {c_id} | Code: {c_code} | Name: {c_name} | Assignee: {c_assignee} | Pits: {c_pits} | Shots: {c_shots} | Dates: {sorted(list(c_dates))}")
