import requests
import os
import dotenv

dotenv.load_dotenv('e:/Hero_HDD/hero_web/backend/.env')

token = os.environ.get('ILYNC_API_TOKEN')
headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/json'}
base_url = 'https://ilync.tech/api'

discovered_executions = []

def resolve_task_tree(task_id, parent_info=None, depth=0):
    if depth > 4: return
    
    r_det = requests.get(f"{base_url}/tasks/{task_id}", headers=headers, timeout=10)
    if r_det.status_code != 200: return
    
    t_data = r_det.json().get('data', {})
    if not t_data: return
    
    code = t_data.get('taskCode') or task_id
    name = t_data.get('displayName') or 'Task'
    assignee = t_data.get('assigneeSnapshot', {}).get('name') or t_data.get('assigneeName') or 'Unassigned'
    loc = t_data.get('locationSnapshot') or t_data.get('location') or {}
    district = loc.get('district') or (parent_info.get('district') if parent_info else 'GANGANAGAR')
    block = loc.get('blockName') or loc.get('block') or (parent_info.get('block') if parent_info else 'KARANPUR')
    state = loc.get('circle') or (parent_info.get('state') if parent_info else 'RAJASTHAN')

    curr_info = {'district': district, 'block': block, 'state': state, 'assignee': assignee, 'taskCode': code, 'displayName': name}

    # Check if this task has execution data
    exec_obj = t_data.get('taskExecution')
    if not exec_obj:
        r_exec = requests.get(f"{base_url}/tasks/{task_id}/execution", headers=headers, timeout=10)
        if r_exec.status_code == 200:
            exec_obj = r_exec.json().get('data')

    pits_count = 0
    shots_count = 0
    dates_found = set()

    if exec_obj:
        fd = exec_obj.get('fieldData', {}) if isinstance(exec_obj, dict) else {}
        tr = fd.get('trenching', {}) if isinstance(fd, dict) else {}
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

        if pits_count > 0 or shots_count > 0:
            discovered_executions.append({
                'taskId': task_id,
                'taskCode': code,
                'displayName': name,
                'assignee': assignee,
                'district': district,
                'block': block,
                'state': state,
                'pitsCount': pits_count,
                'shotsCount': shots_count,
                'dates': sorted(list(dates_found)),
                'execObj': exec_obj
            })
            print(f"  [DISCOVERED EXECUTION] Task: {task_id} ({code} - {name}) | Assignee: {assignee} | District: {district} | Block: {block} | Pits: {pits_count} | Shots: {shots_count} | Dates: {sorted(list(dates_found))}")

    # Check children recursively
    r_child = requests.get(f"{base_url}/tasks/{task_id}/children", headers=headers, timeout=10)
    children = r_child.json().get('data', []) if r_child.status_code == 200 else []
    if children and isinstance(children, list):
        for c in children:
            c_id = c.get('id') or c.get('_id')
            if c_id:
                resolve_task_tree(c_id, curr_info, depth + 1)

# Fetch top-level my-tasks
r_tasks = requests.get(f"{base_url}/tasks/my-tasks?taskType=FIBER_TRENCHING_DUCTING_TASK&page=0&size=50", headers=headers, timeout=10)
top_tasks = r_tasks.json().get('data', {}).get('content', [])

print(f"Top-level tasks count: {len(top_tasks)}")
for t in top_tasks:
    t_id = t.get('id')
    print(f"\n--- Checking Top Task: {t_id} ({t.get('taskCode')} - {t.get('displayName')}) ---")
    resolve_task_tree(t_id)

print(f"\n==========================================")
print(f"TOTAL EXECUTIONS DISCOVERED: {len(discovered_executions)}")
print(f"==========================================")
