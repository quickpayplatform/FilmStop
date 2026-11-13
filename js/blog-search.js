(() => {
    const search = document.querySelector('.blog-search');
    const input = search.querySelector('input');
    const status = search.querySelector('[role="status"]');
    const grid = document.getElementById('blog-articles');
    const articles = Array.from(grid.querySelectorAll('.blog-card'), card => ({
        card,
        text: Array.from(card.querySelectorAll('h2, p'), element => element.textContent)
            .join(' ').toLowerCase()
    }));

    function filterArticles() {
        const query = input.value.trim().toLowerCase();
        const terms = query.split(/\s+/);
        let matches = 0;

        for (const { card, text } of articles) {
            const visible = terms.every(term => text.includes(term));
            card.hidden = !visible;
            if (visible) matches++;
        }

        grid.hidden = matches === 0;
        if (!query) {
            status.textContent = '';
        } else if (!matches) {
            status.textContent = 'No articles found. Try a different search.';
        } else {
            status.textContent = matches === 1 ? '1 article found.' : `${matches} articles found.`;
        }
    }

    input.addEventListener('input', filterArticles);
    filterArticles();
    search.hidden = false;
})();
