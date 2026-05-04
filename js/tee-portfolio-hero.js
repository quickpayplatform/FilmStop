/* Tee portfolio hero: muted loop background — reliable autoplay + fade-in when playback starts. */

(function initTeePortfolioHeroVideo() {
    function run() {
        if (document.documentElement.getAttribute('data-page') !== 'tee-portfolio') return;

        const media = document.querySelector('.tee-portfolio-hero-media');
        const video = document.getElementById('tee-hero-video');
        if (!media || !video) return;

        const sourceEl = video.querySelector('source');
        const fallbackSrc = video.getAttribute('data-fallback-src') || '';

        let revealed = false;
        const reveal = () => {
            if (revealed) return;
            revealed = true;
            media.classList.add('tee-hero-media--ready');
        };

        video.muted = true;
        video.defaultMuted = true;
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');

        const tryPlay = () => {
            const p = video.play();
            if (p !== undefined && typeof p.catch === 'function') {
                p.catch(() => {});
            }
        };

        let swappedFallback = false;
        const swapFallback = () => {
            if (swappedFallback || !sourceEl || !fallbackSrc) return;
            swappedFallback = true;
            sourceEl.src = fallbackSrc;
            video.load();
            tryPlay();
        };

        video.addEventListener('error', () => swapFallback(), { once: true });

        video.addEventListener(
            'playing',
            () => {
                requestAnimationFrame(() => reveal());
            },
            { once: true }
        );

        video.addEventListener('canplay', () => tryPlay(), { once: true });
        video.addEventListener('loadeddata', () => tryPlay(), { once: true });

        tryPlay();
        if (video.readyState >= 2) {
            tryPlay();
        }

        window.setTimeout(() => {
            tryPlay();
            if (!revealed && !video.error && (video.readyState >= 2 || !video.paused)) {
                reveal();
            }
        }, 2800);

        window.setTimeout(() => {
            tryPlay();
            if (!revealed) reveal();
        }, 9000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();
