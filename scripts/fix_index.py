
import os

file_path = r'c:\Users\user\Documents\GitHub\exampleSite\themes\liva-hugo\layouts\index.html'

def fix_file():
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Define replacements - removing spaces after opening quote
        replacements = [
            ('{{ " practice-sharing/"', '{{ "practice-sharing/"'),
            ('{{ " tags/automation/"', '{{ "tags/automation/"'),
            ('{{ " real-estate/"', '{{ "real-estate/"'),
            ('{{ " automation/"', '{{ "automation/"'),
            ('{{ " lifestyle/"', '{{ "lifestyle/"')
        ]

        new_content = content
        for old, new in replacements:
            new_content = new_content.replace(old, new)

        if content == new_content:
            print("No pattern matches found for replacement.")
        else:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print("Successfully updated index.html with corrected links.")

    except Exception as e:
        print(f"Error processing file: {e}")

if __name__ == "__main__":
    fix_file()
