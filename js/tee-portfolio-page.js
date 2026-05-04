/* Tee Sama — professional portfolio (loads after main.js, before DOMContentLoaded) */

(function initTeePortfolioPage() {
    if (document.documentElement.getAttribute('data-page') !== 'tee-portfolio') return;

    const filtersContainer = document.getElementById('tee-portfolio-filters');
    const sectionsContainer = document.getElementById('tee-portfolio-sections');
    const PR = window.PortfolioRender;

    const data = window.PORTFOLIO_DATA;
    if (!filtersContainer || !sectionsContainer || !PR || !Array.isArray(data) || data.length === 0) {
        return;
    }

    const TEE_SECTION_ORDER = [
        'Documentary / Storytelling',
        'Business Impact',
        'Branded Work',
        'Music Videos',
        'Events & Live Coverage',
        'Social Content'
    ];

    function mapToTeeCategory(item) {
        const cat = item.category;
        if (cat === 'Business Impact') return 'Business Impact';
        if (cat === 'Commercials') return 'Branded Work';
        if (cat === 'Music Videos') return 'Music Videos';
        if (cat === 'Events') return 'Events & Live Coverage';
        if (cat === 'Documentary') return 'Documentary / Storytelling';
        if (cat === 'Reels') return 'Social Content';
        return 'Branded Work';
    }

    function createFilterButton(label, filterKey, isActive) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `filter-btn${isActive ? ' active' : ''}`;
        button.dataset.filter = filterKey;
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        button.textContent = label;
        return button;
    }

    const buckets = new Map();
    TEE_SECTION_ORDER.forEach((label) => buckets.set(label, []));

    data.forEach((item) => {
        const label = mapToTeeCategory(item);
        const list = buckets.get(label);
        if (list) list.push(item);
    });

    const doc = buckets.get('Documentary / Storytelling');
    if (doc && doc.length) {
        const beMore = doc.filter((i) => i.title === 'Be More');
        const rest = doc.filter((i) => i.title !== 'Be More');
        buckets.set('Documentary / Storytelling', [...beMore, ...rest]);
    }

    const activeLabels = TEE_SECTION_ORDER.filter((label) => (buckets.get(label) || []).length > 0);

    const fragFilters = document.createDocumentFragment();
    fragFilters.appendChild(createFilterButton('All', 'all', true));
    activeLabels.forEach((label) => {
        fragFilters.appendChild(createFilterButton(label, PR.slugify(label), false));
    });
    filtersContainer.appendChild(fragFilters);

    const fragment = document.createDocumentFragment();

    activeLabels.forEach((label) => {
        const items = buckets.get(label) || [];
        const key = PR.slugify(label);

        const section = document.createElement('section');
        section.className = 'portfolio-section tee-portfolio-category';
        section.dataset.category = key;

        const header = document.createElement('div');
        header.className = 'portfolio-section-header';

        const title = document.createElement('h3');
        title.className = 'portfolio-section-title';
        title.textContent = label;

        const count = document.createElement('span');
        count.className = 'portfolio-section-count';
        count.textContent = `${items.length} video${items.length === 1 ? '' : 's'}`;

        header.appendChild(title);
        header.appendChild(count);

        const grid = document.createElement('div');
        grid.className = 'work-grid';

        items.forEach((item) => {
            const cardPayload = Object.assign({}, item, { category: label });
            grid.appendChild(PR.createWorkCard(cardPayload));
        });

        section.appendChild(header);
        section.appendChild(grid);
        fragment.appendChild(section);
    });

    sectionsContainer.appendChild(fragment);
})();
