/* Tee portfolio hero: fade in background video only after playback starts (no frozen first frame). */

(function initTeePortfolioHeroVideo() {
    function run() {
        if (document.documentElement.getAttribute('data-page') !== 'tee-portfolio') return;

        const media = document.querySelector('.tee-portfolio-hero-media');
        const video = document.getElementById('tee-hero-video');
        if (!media || !video) return;

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

        const tryPlay = () => {
            const p = video.play();
            if (p !== undefined && typeof p.catch === 'function') {
                p.catch(() => {});
            }
        };

        video.addEventListener(
            'playing',
            () => {
                requestAnimationFrame(() => reveal());
            },
            { once: true }
        );

        if (video.readyState >= 3) {
            tryPlay();
        } else {
            video.addEventListener('canplay', tryPlay, { once: true });
            video.addEventListener('loadeddata', tryPlay, { once: true });
        }

        window.setTimeout(() => {
            if (revealed) return;
            tryPlay();
            if (!video.paused && video.currentTime > 0) {
                reveal();
            } else if (video.readyState >= 3) {
                reveal();
            }
        }, 12000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();
