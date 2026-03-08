import re

with open('frontend/src/components/navigation/Sidebar.tsx', 'r') as f:
    content = f.read()

target2 = '{ name: "Settings", href: "/settings", icon: Settings },'
replacement2 = '{ name: "Podcast Studio", href: "/podcast", icon: Headphones },\n        ' + target2

content = content.replace(target2, replacement2)

with open('frontend/src/components/navigation/Sidebar.tsx', 'w') as f:
    f.write(content)
