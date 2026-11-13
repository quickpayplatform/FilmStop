"""Render static blog pages from scripts/blog-posts.json before committing."""
import json
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://filmstopcreate.com"
POSTS = json.loads((ROOT / "scripts/blog-posts.json").read_text())


def page(title, description, path, body, image):
    canonical = ORIGIN + path
    return f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{escape(title)} | Film Stop</title>
    <meta name="description" content="{escape(description)}">
    <link rel="canonical" href="{canonical}">
    <meta property="og:title" content="{escape(title)} | Film Stop">
    <meta property="og:description" content="{escape(description)}">
    <meta property="og:url" content="{canonical}">
    <meta property="og:image" content="{ORIGIN}{image}">
    <meta property="og:type" content="{'website' if path == '/blog/' else 'article'}">
    <link rel="icon" href="/assets/images/filmstop-logo-white.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css?v=white-logo">
    <link rel="stylesheet" href="/css/blog.css?v={4 if path == '/blog/' else 2}">
</head>
<body>
    <nav class="blog-nav blog-shell" aria-label="Main navigation">
        <a href="/"><img src="/assets/images/filmstop-logo-white.png" alt="Film Stop home"></a>
        <div>
            <a href="/portfolio">Work</a>
            <a href="/blog/"{' aria-current="page"' if path == '/blog/' else ''}>Blog</a>
            <a href="/quote">Get a quote</a>
        </div>
    </nav>
    <main class="blog-shell">
{body}
    </main>
    <footer class="blog-footer blog-shell">Film Stop · Baltimore, MD · <a href="/form">Contact the studio</a></footer>
</body>
</html>
"""


def cta(title, detail, label="Tell us about your project", url="/form", secondary=None):
    secondary_label, secondary_url = secondary or ("Explore the quote calculator", "/quote")
    return f"""        <section class="blog-cta cta" aria-label="Start a project">
            <h2>{escape(title)}</h2>
            <p>{escape(detail)}</p>
            <div class="blog-actions">
                <a class="blog-button" href="{escape(url)}">{escape(label)}</a>
                <a class="blog-link" href="{escape(secondary_url)}">{escape(secondary_label)} &rarr;</a>
            </div>
        </section>"""


def cover(image, lazy=False, alt=""):
    loading = ' loading="lazy"' if lazy else ' class="blog-cover"'
    return f'<img{loading} src="{escape(image)}" alt="{escape(alt)}">'


def render():
    description = "Practical video production guides for brands, organizations and independent artists from Film Stop, a Baltimore production studio."
    hero = "/assets/thumbnails/film-stop-drone-teaser.jpg"
    cards = "\n".join(
        f"""            <a class="blog-card" href="/blog/{post['slug']}/">
                {cover(post['image'], lazy=True)}
                <div class="blog-card-content">
                    <p class="blog-kicker">{escape(post['category'])}</p>
                    <h2>{escape(post['title'])}</h2>
                    <p>{escape(post['description'])}</p>
                    <span class="blog-link" aria-hidden="true">Read article &rarr;</span>
                </div>
            </a>""" for post in POSTS
    )
    listing = f'        <section class="blog-grid" id="blog-articles" aria-label="Articles">\n{cards}\n        </section>' if cards else ""
    search = """        <div class="blog-search" role="search" aria-label="Blog" hidden>
            <label for="blog-search">Search articles</label>
            <input id="blog-search" type="search" placeholder="Try corporate video or event coverage" aria-controls="blog-articles">
            <p class="blog-search-status" role="status"></p>
        </div>
        <script defer src="/js/blog-search.js"></script>""" if cards else ""
    intro = """        <header class="blog-intro blog-index-intro">
            <h1>Film Stop Blog</h1>
            <p>Practical guides to planning video projects, from the first brief to the final cut.</p>
        </header>"""
    project = cta("Have a video in mind?", "Tell us who you want to reach, what you want them to do, and when you need the video.")
    (ROOT / "blog/index.html").write_text(page("Video Production Blog", description, "/blog/", "\n".join(
        [intro, f"        {cover(hero)}", search, listing, project]
    ), hero), encoding="utf-8")

    for post in POSTS:
        title = post["title"]
        description = post["description"]
        path = f"/blog/{post['slug']}/"
        image = post["image"]
        sections = "\n".join(
            f"            <h2>{escape(heading)}</h2>\n" +
            "\n".join(f"            <p>{escape(paragraph)}</p>" for paragraph in paragraphs)
            for heading, *paragraphs in post["sections"]
        )
        sources = " · ".join(
            f'<a href="{escape(url)}">{escape(label)}</a>'
            for label, url in post.get("sources", [])
        )
        if sources:
            sections = sections.replace("\n            <h2>", f"\n            <p>{sources}</p>\n            <h2>", 1)
        secondary = post.get("secondary")
        if post["cta"][3] == "/quote":
            secondary = ("Tell us about your project", "/form")
        article = f"""        <article>
            <header class="blog-intro">
                <a class="blog-link" href="/blog/">&larr; All articles</a>
                <p class="blog-kicker">{escape(post['category'])}</p>
                <h1>{escape(title)}</h1>
                <p>{escape(description)}</p>
                <p><time datetime="{post['date']}">{post['displayDate']}</time> · Film Stop</p>
                <div class="blog-actions">
                    <a class="blog-button" href="{escape(post["cta"][3])}">{escape(post["cta"][2])}</a>
                </div>
            </header>
            <figure class="blog-figure">
                {cover(image, alt=post["imageAlt"])}
            </figure>
            <div class="blog-reading">
{sections}
            </div>
        </article>
{cta(*post['cta'], secondary=secondary)}"""
        output = ROOT / path.lstrip("/")
        output.mkdir(parents=True, exist_ok=True)
        (output / "index.html").write_text(page(title, description, path, article, image), encoding="utf-8")


if __name__ == "__main__":
    render()
