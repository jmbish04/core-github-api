with open('frontend/src/pages/podcast/index.astro', 'r') as f:
    content = f.read()

content = content.replace("import RootLayout from '../../layouts/RootLayout';", "import Layout from '../../layouts/Layout.astro';")
content = content.replace("<RootLayout client:load>", "<Layout title=\"Podcast Studio\">")
content = content.replace("</RootLayout>", "</Layout>")

with open('frontend/src/pages/podcast/index.astro', 'w') as f:
    f.write(content)
