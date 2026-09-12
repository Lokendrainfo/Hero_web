import os
import sys
import django

import sys
sys.path.insert(0, r'e:\Hero_HDD\hero_web\backend')
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
try:
    import django
    django.setup()
except Exception:
    pass

from apps.integrations.ilync.client import IlyncClient

client = IlyncClient()

task_id = "6a9672049e04009ee6590c26"
print("=== TASK DETAIL ===")
try:
    detail = client.get_task_detail(task_id)
    print("Keys in detail:", list(detail.keys()) if isinstance(detail, dict) else type(detail))
    if isinstance(detail, dict):
        print("taskExecution in detail:", "taskExecution" in detail)
        if "taskExecution" in detail:
            te = detail["taskExecution"]
            print("taskExecution keys:", list(te.keys()) if isinstance(te, dict) else type(te))
except Exception as e:
    print("Task detail error:", e)

print("\n=== TASK EXECUTION ===")
try:
    exec_data = client.get_task_execution(task_id)
    print("Exec data keys:", list(exec_data.keys()) if isinstance(exec_data, dict) else type(exec_data))
except Exception as e:
    print("Task execution error:", e)

print("\n=== TASK CHILDREN ===")
try:
    children = client.get_task_children(task_id)
    raw_c = children.get('data') or children.get('content') or children
    print(f"Found {len(raw_c)} children")
    for idx, c in enumerate(raw_c[:5]):
        cid = c.get('id')
        c_code = c.get('taskCode')
        c_name = c.get('displayName')
        c_exec = c.get('taskExecution')
        print(f"Child {idx+1}: id={cid}, code={c_code}, name={c_name}, has_exec={bool(c_exec)}")
        if c_exec:
            fd = c_exec.get('fieldData') or {}
            tr = fd.get('trenching') or {}
            pits = tr.get('pitDetails') or []
            shots = tr.get('hddShot') or []
            depths_count = sum(len(s.get('depthCapture') or []) for s in shots)
            print(f"   -> Pits: {len(pits)}, Depth Points: {depths_count}")
except Exception as e:
    print("Children error:", e)
