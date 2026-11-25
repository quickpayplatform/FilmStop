"""Render static blog pages from scripts/blog-posts.json before committing."""
import json
import math
import re
from html import unescape
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://filmstopcreate.com"
POSTS = json.loads((ROOT / "scripts/blog-posts.json").read_text())


def reading_minutes(post):
    article_text = " ".join(text for section in post["sections"] for text in section)
    article_text = unescape(re.sub(r"<[^>]+>", " ", article_text))
    word_count = len(re.findall(r"\b[\w’'-]+\b", article_text))
    return max(1, math.ceil(word_count / 200))


def page(title, description, path, body, image, image_alt="", structured_data=""):
    canonical = ORIGIN + path
    is_article = path != "/blog/"
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
    <meta property="og:image:alt" content="{escape(image_alt)}">
    <meta property="og:site_name" content="Film Stop">
    <meta property="og:locale" content="en_US">
    <meta property="og:type" content="{'article' if is_article else 'website'}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{escape(title)} | Film Stop">
    <meta name="twitter:description" content="{escape(description)}">
    <meta name="twitter:image" content="{ORIGIN}{image}">
    {structured_data}
    <link rel="icon" href="/assets/images/filmstop-logo-white.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css?v=white-logo">
    <link rel="stylesheet" href="/css/blog.css?v={6 if path == '/blog/' else 3}">
    <link rel="stylesheet" href="/css/navigation.css?v=1">
    <script src="/js/navigation.js?v=1" defer></script>
</head>
<body>
    <nav class="blog-shell compact-navigation static-navigation" aria-label="Main navigation">
        <a href="/" class="compact-logo" aria-label="Film Stop home"><img src="/assets/images/filmstop-logo-white.png" alt="Film Stop"></a>
        <div class="compact-actions"><a class="compact-cta" href="/quote">Get a quote</a>
            <details class="site-menu">
                <summary aria-label="Open navigation menu" aria-controls="site-dropdown"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></summary>
                <div class="site-dropdown" id="site-dropdown"><a href="/#work">Work</a>
<a href="/portfolio">Portfolio</a>
<a href="/#services">Services</a>
<a href="/#about">About</a>
<a href="/quote">Quote</a>
<a href="/blog/">Blog</a>
<a href="/project-profiles/">Project Profiles</a>
<a href="/#contact">Contact</a></div>
            </details>
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
        f"""            <a class="blog-card" href="/blog/{post['slug']}/" data-search-terms="{escape(' '.join(post.get('search_terms', [])))}">
                {cover(post['image'], lazy=True)}
                <div class="blog-card-content">
                    <p class="blog-kicker">{escape(post['category'])}</p>
                    <p class="blog-card-meta"><time datetime="{escape(post['date'])}">{escape(post['displayDate'])}</time><span>{reading_minutes(post)} min read</span></p>
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
    index_schema = json.dumps({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "Film Stop Video Production Blog",
        "description": description,
        "url": ORIGIN + "/blog/",
        "isPartOf": {"@type": "WebSite", "name": "Film Stop", "url": ORIGIN + "/"},
        "mainEntity": {
            "@type": "ItemList",
            "itemListElement": [
                {"@type": "ListItem", "position": i, "url": ORIGIN + f"/blog/{post['slug']}/", "name": post["title"]}
                for i, post in enumerate(POSTS, 1)
            ],
        },
    }, ensure_ascii=False).replace("</", "<\\/")
    index_schema_script = f'<script type="application/ld+json">{index_schema}</script>'
    (ROOT / "blog/index.html").write_text(page("Video Production Blog", description, "/blog/", "\n".join(
        [intro, f"        {cover(hero)}", search, listing, project]
    ), hero, "Film Stop video production blog", index_schema_script), encoding="utf-8")

    for post in POSTS:
        title = post["title"]
        description = post["description"]
        path = f"/blog/{post['slug']}/"
        image = post["image"]
        image_alt = post.get("imageAlt", "")
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
        keywords = post.get("search_terms", [])
        topic_tags = ""
        if keywords:
            topic_tags = """\n            <aside class="blog-topics" aria-label="Article topics">
                <h2>Topics</h2>
                <ul>""" + "".join(f"\n                    <li>{escape(term)}</li>" for term in keywords[:5]) + """\n                </ul>
            </aside>"""
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
{topic_tags}
        </article>
{cta(*post['cta'], secondary=secondary)}"""
        article_schema = json.dumps({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": title,
            "description": description,
            "image": ORIGIN + image,
            "datePublished": post["date"],
            "dateModified": post.get("dateModified", post["date"]),
            "author": {"@type": "Organization", "name": "Film Stop", "url": ORIGIN + "/"},
            "publisher": {
                "@type": "Organization",
                "name": "Film Stop",
                "url": ORIGIN + "/",
                "logo": {"@type": "ImageObject", "url": ORIGIN + "/assets/images/filmstop-logo-white.png"},
            },
            "articleSection": post.get("category", "Video production"),
            "keywords": keywords,
            "mainEntityOfPage": {"@type": "WebPage", "@id": ORIGIN + path},
        }, ensure_ascii=False).replace("</", "<\\/")
        article_schema_script = f'<script type="application/ld+json">{article_schema}</script>'
        output = ROOT / path.lstrip("/")
        output.mkdir(parents=True, exist_ok=True)
        (output / "index.html").write_text(page(title, description, path, article, image, image_alt, article_schema_script), encoding="utf-8")

    sitemap_urls = [
        (ORIGIN + "/", ""),
        (ORIGIN + "/portfolio", ""),
        (ORIGIN + "/business", ""),
        (ORIGIN + "/blog/", max((post.get("dateModified", post["date"]) for post in POSTS), default="")),
    ] + [
        (ORIGIN + f"/blog/{post['slug']}/", post.get("dateModified", post["date"]))
        for post in POSTS
    ]
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    for url, lastmod in sitemap_urls:
        date_tag = f"<lastmod>{escape(lastmod)}</lastmod>" if lastmod else ""
        sitemap += f"  <url><loc>{escape(url)}</loc>{date_tag}</url>\n"
    sitemap += "</urlset>\n"
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    (ROOT / "robots.txt").write_text(
        "User-agent: *\nAllow: /\n\nSitemap: https://filmstopcreate.com/sitemap.xml\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    render()
