import os
import glob

html_files = glob.glob('/Users/jayveelugod/Documents/trainings/fitnesspal/frontend/*.html')
js_files = glob.glob('/Users/jayveelugod/Documents/trainings/fitnesspal/frontend/scripts/*.js')

for fpath in html_files + js_files:
    with open(fpath, 'r') as f:
        content = f.read()
    
    # Fix specific weird ones first
    content = content.replace('assets/../assets/', 'assets/')
    content = content.replace('../assets/', 'assets/')
    
    with open(fpath, 'w') as f:
        f.write(content)

print(f"Fixed {len(html_files) + len(js_files)} files.")
