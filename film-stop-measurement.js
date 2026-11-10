/* Film Stop interaction and confirmed inquiry signals for Google Tag Manager. */
(() => {
    if (!['filmstopcreate.com', 'www.filmstopcreate.com'].includes(location.hostname)) return;

    const track = (event, type, label, placement, target = '', options = {}) => {
        (window.dataLayer ||= []).push({
            event,
            fs_type: type,
            fs_label: label,
            fs_placement: placement,
            fs_target: target,
            ...options
        });
    };

    const text = element => (element.getAttribute('aria-label') || element.textContent)
        .replace(/\s+/g, ' ').trim().slice(0, 100);

    function placement(element) {
        if (element.closest('.mobile-menu')) return 'mobile_menu';
        if (element.closest('nav, header')) return 'header';
        if (element.closest('footer')) return 'footer';
        if (element.closest('.hero, .hero-cta, .tee-portfolio-hero-cta')) return 'hero';
        if (element.closest('.estimate-ctas')) return 'estimate';
        if (element.closest('#contact, .page-panel')) return 'contact';
        if (element.closest('.cta, .faq-cta')) return 'call_to_action';
        return 'page_body';
    }

    function trackClick(event) {
        if (event.type === 'auxclick' && event.button !== 1) return;
        const element = event.target.closest?.('a[href], .filter-btn, .faq-question, .project-play, .work-item-overlay, .nav-toggle, .quote-nav-toggle');
        if (!element) return;

        if (element.matches('a[href]')) {
            if (element.getAttribute('href') === '#') return;
            const url = new URL(element.href);
            let type = 'external_link';
            let label = text(element) || element.querySelector('img[alt]')?.alt || 'Film Stop';
            let target = url.hostname;

            if (url.protocol === 'mailto:' || url.protocol === 'tel:') {
                type = url.protocol === 'mailto:' ? 'email' : 'phone';
                label = type === 'email' ? 'Email Film Stop' : 'Call Film Stop';
                target = '';
            } else if (url.hostname === 'calendar.app.google' || url.hostname === 'calendar.google.com') {
                type = 'calendar_booking';
                target = 'google_calendar';
            } else if (url.origin === location.origin) {
                const path = url.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
                target = path + url.hash;
                if (url.hash === '#contact') type = 'consultation';
                else if (path === '/quote') type = 'quote';
                else if (path === '/form') type = 'inquiry_form';
                else type = 'internal_link';
            } else if (url.protocol !== 'https:' && url.protocol !== 'http:') {
                return;
            }
            const leavesPage = url.origin === location.origin &&
                (url.pathname !== location.pathname || url.search !== location.search);
            const regularNavigation = event.type === 'click' && event.button === 0 &&
                !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey &&
                !event.altKey && (!element.target || element.target === '_self') &&
                !element.hasAttribute('download');
            if (leavesPage && regularNavigation && window.google_tag_manager?.['GTM-T33FCN4H']) {
                // Keep the current page alive briefly so GTM can process the click.
                event.preventDefault();
                let navigated = false;
                const finish = () => {
                    if (navigated) return;
                    navigated = true;
                    location.assign(url.href);
                };
                window.setTimeout(finish, 400);
                track('film_stop_cta', type, label, placement(element), target, {
                    eventCallback: finish, eventTimeout: 350
                });
            } else {
                track('film_stop_cta', type, label, placement(element), target);
            }
            return;
        }

        if (element.matches('.filter-btn')) {
            track('film_stop_engagement', 'portfolio_filter', text(element), placement(element));
        } else if (element.matches('.faq-question')) {
            const item = element.closest('.faq-item');
            if (!item?.classList.contains('active')) {
                track('film_stop_engagement', 'faq_open', text(element), placement(element));
            }
        } else if (element.matches('.project-play, .work-item-overlay')) {
            const title = element.dataset.title || element.closest('.work-item')?.querySelector('h3')?.textContent;
            track('film_stop_engagement', 'video_select', title?.trim().slice(0, 100) || text(element), 'portfolio');
        } else {
            track('film_stop_engagement', 'menu_toggle', text(element), 'header');
        }
    }

    document.addEventListener('click', trackClick, true);
    document.addEventListener('auxclick', trackClick, true);
    document.addEventListener('change', event => {
        const field = event.target;
        if (field.matches('#budget-calculator input[type="radio"], #budget-calculator input[type="checkbox"]')) {
            track('film_stop_engagement', 'quote_selection', field.id, 'estimate', field.checked ? 'selected' : 'cleared');
        }
    });

    const startedVideos = new WeakMap();
    function trackVideo(event) {
        const video = event.target;
        if (!video.matches?.('video[controls]')) return;
        const source = video.currentSrc;
        if (!source) return;
        const clip = new URL(source).pathname.split('/').pop().replace(/\.[^.]+$/, '');
        if (event.type === 'playing' && startedVideos.get(video) === source) return;
        if (event.type === 'ended') startedVideos.delete(video);
        else startedVideos.set(video, source);
        track('film_stop_engagement', event.type === 'ended' ? 'video_complete' : 'video_start',
            video.getAttribute('aria-label') || clip, placement(video));
    }
    document.addEventListener('playing', trackVideo, true);
    document.addEventListener('ended', trackVideo, true);

    document.addEventListener('submit', async event => {
        const form = event.target;
        if (!form.matches?.('form#contact-form[name="contact"], form[name="form"][action]')) return;
        const button = form.querySelector('button[type="submit"]');
        if (!button) return;
        event.preventDefault();
        // The homepage already has an AJAX submit handler. Use one POST for each inquiry.
        event.stopImmediatePropagation();
        if (button.disabled) return;

        const source = form.id === 'contact-form' ? 'homepage' : 'contact_page';
        const originalLabel = button.innerHTML;
        const formData = new FormData(form);
        const honeypotFilled = Boolean(formData.get('bot-field'));
        button.disabled = true;
        button.textContent = 'Sending…';
        let status = form.querySelector('[data-film-stop-status]');
        if (!status) {
            status = document.createElement('p');
            status.dataset.filmStopStatus = '';
            status.setAttribute('role', 'status');
            button.before(status);
        }
        status.textContent = '';

        try {
            const response = await fetch('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(formData)
            });
            if (!response.ok) throw new Error('Form POST failed');
        } catch {
            status.textContent = 'Your message could not be sent. Please try again.';
            button.innerHTML = originalLabel;
            button.disabled = false;
            return;
        }

        form.reset();
        status.textContent = 'Message sent.';
        if (source === 'homepage') {
            if (!honeypotFilled) track('film_stop_lead', 'inquiry', source, source);
            button.textContent = 'Message Sent! ✓';
            window.setTimeout(() => {
                button.innerHTML = originalLabel;
                button.disabled = false;
            }, 3000);
            return;
        }

        // Let GTM process the lead before the existing confirmation-page navigation.
        const redirect = () => location.assign(form.action);
        if (honeypotFilled) {
            redirect();
            return;
        }
        let redirected = false;
        const finish = () => {
            if (redirected) return;
            redirected = true;
            redirect();
        };
        window.setTimeout(finish, 900);
        track('film_stop_lead', 'inquiry', source, source, '', { eventCallback: finish, eventTimeout: 800 });
    }, true);
})();
