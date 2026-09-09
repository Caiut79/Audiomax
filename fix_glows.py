import re
import sys

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # We only want to modify the dark mode block.
    # The dark mode block starts with `:host-context([data-theme='dark']) {`
    # We will find this block and modify its contents.
    
    parts = content.split(":host-context([data-theme='dark']) {")
    if len(parts) == 1:
        # Check for `:root[data-theme='dark'] {` just in case
        parts = content.split(":root[data-theme='dark'] {")
        if len(parts) == 1:
            print(f"No dark mode block found in {filepath}")
            return

    prefix = parts[0]
    dark_block_and_rest = parts[1]
    
    # We don't really need to parse the matching brace if we just replace throughout the rest of the file,
    # assuming the rest of the file is mostly the dark mode block. 
    # But to be safe, let's just do a global replace of the glowing colors inside the dark block text.
    
    # Colors to remove/make transparent in dark mode:
    # rgba(124, 196, 255, 0.xx) -> light blue
    # rgba(14, 165, 233, 0.xx) -> cyan
    # rgba(37, 99, 235, 0.xx) -> blue
    # rgba(var(--surface-light-rgb), 0.xx) -> white-ish
    # rgba(16, 185, 129, 0.xx) -> green glow
    # rgba(245, 158, 11, 0.xx) -> yellow glow
    # rgba(239, 68, 68, 0.xx) -> red glow
    # rgba(59, 130, 246, 0.xx) -> blue glow

    # Let's replace the alpha values with 0.0 or just a very low value, or simply replace the whole radial-gradient/linear-gradient with transparent.
    # Replacing the gradients is safer.
    
    # Regex to match radial-gradient(...) and linear-gradient(...)
    # Since they can contain nested parentheses, we can use a recursive-like or simple non-greedy approach since they usually don't have nested parens other than rgba()
    
    # pattern: (radial-gradient|linear-gradient)\([^)]*rgba\([^)]*\)[^)]*\)
    # Actually, CSS gradients can be multi-line.
    # Let's just replace the rgba colors directly with transparent.
    
    replacements = [
        (r'rgba\(124,\s*196,\s*255,\s*0\.\d+\)', 'transparent'),
        (r'rgba\(14,\s*165,\s*233,\s*0\.\d+\)', 'transparent'),
        (r'rgba\(37,\s*99,\s*235,\s*0\.\d+\)', 'transparent'),
        (r'rgba\(var\(--surface-light-rgb\),\s*0\.[789]\d*\)', 'transparent'), # mostly for backgrounds/shadows
        (r'rgba\(16,\s*185,\s*129,\s*0\.\d+\)', 'transparent'),
        (r'rgba\(245,\s*158,\s*11,\s*0\.\d+\)', 'transparent'),
        (r'rgba\(239,\s*68,\s*68,\s*0\.\d+\)', 'transparent'),
        (r'rgba\(59,\s*130,\s*246,\s*0\.\d+\)', 'transparent'),
        (r'rgba\(var\(--surface-light-rgb\),\s*0\.[1-6]\d*\)', 'transparent'),
    ]
    
    modified_dark_block = dark_block_and_rest
    for pattern, repl in replacements:
        modified_dark_block = re.sub(pattern, repl, modified_dark_block)
        
    # Also, there are some `inset 0 1px 0 rgba(var(--surface-light-rgb), 0.8)` which become `inset 0 1px 0 transparent`. This is fine.
    
    new_content = prefix + ":host-context([data-theme='dark']) {" + modified_dark_block
    
    with open(filepath, 'w') as f:
        f.write(new_content)
    print(f"Processed {filepath}")

for f in ['src/app/dashboard-page.scss', 'src/app/section-page.scss', 'src/app/app.scss', 'src/styles.scss']:
    process_file(f)
