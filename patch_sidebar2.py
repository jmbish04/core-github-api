with open('frontend/src/components/navigation/Sidebar.tsx', 'r') as f:
    content = f.read()

content = content.replace('import { Headphones,  cn } from "@/lib/utils";', 'import { cn } from "@/lib/utils";')
content = content.replace('import {\n    BookOpen,', 'import {\n    Headphones,\n    BookOpen,')

with open('frontend/src/components/navigation/Sidebar.tsx', 'w') as f:
    f.write(content)
