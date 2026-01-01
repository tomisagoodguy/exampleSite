import os
import re

# Configuration
CONTENT_DIR = 'C:/Users/user/Documents/GitHub/exampleSite/content' 
MAPPINGS = {
    'automation': ['不務正業', 'Excel vba'],
    'lifestyle': ['食譜筆記', 'French cuisine', 'Italian cuisine'],
    'real-estate': ['考試筆記', '財經筆記', 'Office']
}

def migrate_categories():
    print(f"Starting migration in {os.path.abspath(CONTENT_DIR)}")
    
    # Reverse mapping for easier lookup
    category_map = {}
    for new_cat, old_cats in MAPPINGS.items():
        for old in old_cats:
            category_map[old] = new_cat

    for root, dirs, files in os.walk(CONTENT_DIR):
        for file in files:
            if file.endswith('.md'):
                filepath = os.path.join(root, file)
                process_file(filepath, category_map)

def process_file(filepath, category_map):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to find categories in front matter
    # Assumes front matter is between first two ---
    # Handles: categories: ["A", "B"] or categories: A
    
    # Simple approach: Read line by line to find 'categories' within front matter
    lines = content.splitlines()
    new_lines = []
    in_front_matter = False
    front_matter_count = 0
    modified = False

    for line in lines:
        if line.strip() == '---':
            front_matter_count += 1
            if front_matter_count <= 2:
                in_front_matter = not in_front_matter
        
        if in_front_matter and line.strip().startswith('categories:'):
            # Parse current categories
            # This is a basic parser, valid for typical Hugo/Jekyll simple arrays
            current_line_content = line.split(':', 1)[1].strip()
            
            # Remove brackets and quotes to get raw values
            clean_content = current_line_content.replace('[', '').replace(']', '').replace('"', '').replace("'", "")
            current_cats = [c.strip() for c in clean_content.split(',')]
            
            new_cats = set()
            has_change = False
            
            for cat in current_cats:
                if cat in category_map:
                    new_cats.add(category_map[cat])
                    has_change = True
                else:
                    new_cats.add(cat)
            
            if has_change:
                # Reconstruct line
                params = [f'"{c}"' for c in new_cats if c] # Filter empty
                if params:
                    new_line = f'categories: [{", ".join(params)}]'
                    new_lines.append(new_line)
                    modified = True
                    print(f"Updated {filepath}: {current_cats} -> {new_cats}")
                else:
                    new_lines.append(line) # Keep original if empty result (shouldn't happen matching logic)
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)

    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_lines) + '\n')

if __name__ == '__main__':
    migrate_categories()
