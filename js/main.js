/* ============================================
   FILM STOP - Main JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all modules
    Loader.init();
    Navigation.init();
    PortfolioRender.init();
    Cursor.init();
    VideoHover.init();
    WorkFilter.init();
    VideoModal.init();
    ScrollAnimations.init();
    CountUp.init();
    ContactForm.init();
    QuoteBuilder.init();
});

/* ============================================
   LOADER
   ============================================ */
const Loader = {
    init() {
        const loader = document.getElementById('loader');

        if (!loader) return;
        let hasHidden = false;

        const hideLoader = () => {
            if (hasHidden) return;
            hasHidden = true;
            loader.classList.add('hidden');
            loader.style.pointerEvents = 'none';
            document.body.style.overflow = '';
            setTimeout(() => {
                loader.style.display = 'none';
                if (loader.parentNode) {
                    loader.parentNode.removeChild(loader);
                }
            }, 600);
        };

        const safeHide = () => {
            try {
                hideLoader();
            } catch (error) {
                document.body.style.overflow = '';
                loader.style.opacity = '0';
                loader.style.visibility = 'hidden';
                loader.style.pointerEvents = 'none';
            }
        };

        const startHide = () => {
            requestAnimationFrame(() => safeHide());
        };

        // Prevent scroll during loading
        document.body.style.overflow = 'hidden';

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startHide, { once: true });
        } else {
            startHide();
        }

        // Backup on full load
        window.addEventListener('load', () => {
            setTimeout(() => safeHide(), 0);
        }, { once: true });

        // Failsafe timeout so loader never traps users
        setTimeout(() => safeHide(), 2000);
    }
};

/* ============================================
   CUSTOM CURSOR
   ============================================ */
const Cursor = {
    cursor: null,
    follower: null,
    
    init() {
        this.cursor = document.querySelector('.cursor');
        this.follower = document.querySelector('.cursor-follower');
        
        if (!this.cursor || window.innerWidth <= 768) return;
        
        document.addEventListener('mousemove', this.move.bind(this));
        
        // Hover effects
        const hoverElements = document.querySelectorAll('a, button, .work-item, .service-card');
        hoverElements.forEach(el => {
            el.addEventListener('mouseenter', () => this.hover(true));
            el.addEventListener('mouseleave', () => this.hover(false));
        });
    },
    
    move(e) {
        this.cursor.style.left = e.clientX + 'px';
        this.cursor.style.top = e.clientY + 'px';
        
        // Follower with delay
        setTimeout(() => {
            this.follower.style.left = e.clientX + 'px';
            this.follower.style.top = e.clientY + 'px';
        }, 50);
    },
    
    hover(isHovering) {
        if (isHovering) {
            this.cursor.classList.add('hover');
            this.follower.classList.add('hover');
        } else {
            this.cursor.classList.remove('hover');
            this.follower.classList.remove('hover');
        }
    }
};

/* ============================================
   NAVIGATION
   ============================================ */
const Navigation = {
    nav: null,
    toggle: null,
    mobileMenu: null,
    
    init() {
        this.nav = document.querySelector('.nav');
        this.toggle = document.querySelector('.nav-toggle');
        this.mobileMenu = document.querySelector('.mobile-menu');
        
        // Scroll effect
        window.addEventListener('scroll', this.onScroll.bind(this));
        
        // Mobile menu toggle
        this.toggle.addEventListener('click', this.toggleMenu.bind(this));
        
        // Close on link click
        const mobileLinks = this.mobileMenu.querySelectorAll('a');
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => this.toggleMenu());
        });
        
        // Smooth scroll for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', this.smoothScroll.bind(this));
        });
    },
    
    onScroll() {
        if (window.scrollY > 50) {
            this.nav.classList.add('scrolled');
        } else {
            this.nav.classList.remove('scrolled');
        }
    },
    
    toggleMenu() {
        this.toggle.classList.toggle('active');
        this.mobileMenu.classList.toggle('active');
        document.body.style.overflow = this.mobileMenu.classList.contains('active') ? 'hidden' : '';
    },
    
    smoothScroll(e) {
        const href = e.currentTarget.getAttribute('href');
        if (href.startsWith('#') && href.length > 1) {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    }
};

/* ============================================
   PORTFOLIO RENDER
   ============================================ */
const PortfolioRender = {
    init() {
        const data = window.PORTFOLIO_DATA;
        if (!Array.isArray(data) || data.length === 0) return;

        const filtersContainer = document.getElementById('portfolio-filters');
        const sectionsContainer = document.getElementById('portfolio-sections');
        if (!filtersContainer || !sectionsContainer) return;

        const categoryMap = new Map();
        data.forEach(item => {
            const key = this.slugify(item.category);
            if (!categoryMap.has(key)) {
                categoryMap.set(key, item.category);
            }
        });

        this.renderFilters(filtersContainer, categoryMap);
        this.renderSections(sectionsContainer, data, categoryMap);
    },

    slugify(text) {
        return text
            .toLowerCase()
            .replace(/&/g, "and")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)+/g, "");
    },

    renderFilters(container, categoryMap) {
        const fragment = document.createDocumentFragment();
        const allButton = this.createFilterButton("All", "all", true);
        fragment.appendChild(allButton);

        categoryMap.forEach((label, key) => {
            fragment.appendChild(this.createFilterButton(label, key, false));
        });

        container.appendChild(fragment);
    },

    createFilterButton(label, filter, isActive) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `filter-btn${isActive ? " active" : ""}`;
        button.dataset.filter = filter;
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
        button.textContent = label;
        return button;
    },

    renderSections(container, data, categoryMap) {
        const fragment = document.createDocumentFragment();

        categoryMap.forEach((label, key) => {
            const section = document.createElement("section");
            section.className = "portfolio-section";
            section.dataset.category = key;

            const header = document.createElement("div");
            header.className = "portfolio-section-header";

            const title = document.createElement("h3");
            title.className = "portfolio-section-title";
            title.textContent = label;

            const count = document.createElement("span");
            count.className = "portfolio-section-count";

            const items = data.filter(item => this.slugify(item.category) === key);
            count.textContent = `${items.length} video${items.length === 1 ? "" : "s"}`;

            header.appendChild(title);
            header.appendChild(count);

            const grid = document.createElement("div");
            grid.className = "work-grid";

            items.forEach(item => grid.appendChild(this.createWorkCard(item)));

            section.appendChild(header);
            section.appendChild(grid);
            fragment.appendChild(section);
        });

        container.appendChild(fragment);
    },

    createWorkCard(item) {
        const article = document.createElement("article");
        article.className = "work-item" + (item.portraitCard ? " work-item--portrait" : "");
        article.dataset.category = this.slugify(item.category);

        const media = document.createElement("div");
        media.className = "work-item-media" + (item.portraitCard ? " work-item-media--portrait" : "");

        const video = document.createElement("video");
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.poster = item.thumbnail;

        const sources = Array.isArray(item.sources) && item.sources.length
            ? item.sources
            : [{ src: item.link, type: item.linkType }];

        sources.forEach(sourceData => {
            const source = document.createElement("source");
            source.src = sourceData.src;
            if (sourceData.type) {
                source.type = sourceData.type;
            }
            video.appendChild(source);
        });

        const overlay = document.createElement("button");
        overlay.type = "button";
        overlay.className = "work-item-overlay";
        overlay.setAttribute("aria-label", `Play ${item.title}`);

        overlay.innerHTML = `
            <span class="work-item-play">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
            </span>
        `;

        media.appendChild(video);
        media.appendChild(overlay);

        const content = document.createElement("div");
        content.className = "work-item-content";

        const category = document.createElement("span");
        category.className = "work-item-category";
        category.textContent = item.category;

        const title = document.createElement("h3");
        title.className = "work-item-title";
        title.textContent = item.title;

        const description = document.createElement("p");
        description.className = "work-item-description";
        description.innerHTML = item.description;

        content.appendChild(category);
        content.appendChild(title);
        content.appendChild(description);

        article.appendChild(media);
        article.appendChild(content);

        return article;
    }
};

window.PortfolioRender = PortfolioRender;

/* ============================================
   VIDEO HOVER EFFECTS
   ============================================ */
const VideoHover = {
    init() {
        const workItems = document.querySelectorAll('.work-item');

        workItems.forEach((item) => {
            if (item.classList.contains('work-item--portrait')) return;

            const video = item.querySelector('video');
            if (!video) return;

            item.addEventListener('mouseenter', () => {
                video.play().catch(() => {});
            });

            item.addEventListener('mouseleave', () => {
                video.pause();
                video.currentTime = 0;
            });
        });
    }
};

/* ============================================
   WORK FILTER
   ============================================ */
const WorkFilter = {
    init() {
        const filterBtns = document.querySelectorAll('.work-filters .filter-btn, #portfolio-filters .filter-btn');
        const segmentLinks = document.querySelectorAll('.segment-link');
        const sections = document.querySelectorAll('.portfolio-section');
        const workItems = document.querySelectorAll('.work-item');

        if (!filterBtns.length && !segmentLinks.length) return;

        segmentLinks.forEach(link => {
            link.addEventListener('click', () => {
                const filter = link.dataset.filter;
                if (!filter) return;
                const targetBtn = document.querySelector(`.work-filters .filter-btn[data-filter="${filter}"]`);
                if (targetBtn) {
                    targetBtn.click();
                }
            });
        });

        if (!filterBtns.length) return;
        
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active button
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filterBtns.forEach(b => b.setAttribute('aria-pressed', 'false'));
                btn.setAttribute('aria-pressed', 'true');
                
                const filter = btn.dataset.filter;
                
                if (sections.length) {
                    // Filter sections on the portfolio page
                    sections.forEach(section => {
                        const shouldShow = filter === 'all' || section.dataset.category === filter;
                        section.classList.toggle('is-hidden', !shouldShow);
                    });
                } else if (workItems.length) {
                    // Filter items on the home page
                    workItems.forEach(item => {
                        if (filter === 'all' || item.dataset.category === filter) {
                            item.style.display = 'block';
                            setTimeout(() => {
                                item.style.opacity = '1';
                                item.style.transform = 'translateY(0)';
                            }, 50);
                        } else {
                            item.style.opacity = '0';
                            item.style.transform = 'translateY(20px)';
                            setTimeout(() => {
                                item.style.display = 'none';
                            }, 300);
                        }
                    });
                }
            });
        });
    }
};

/* ============================================
   VIDEO MODAL
   ============================================ */
const VideoModal = {
    modal: null,
    modalVideo: null,

    isPortraitWorkItem(workItem) {
        if (!workItem) return false;
        if (workItem.classList.contains('work-item--portrait')) return true;
        const video = workItem.querySelector('video');
        if (
            video &&
            video.readyState >= 1 &&
            video.videoWidth > 0 &&
            video.videoHeight > video.videoWidth
        ) {
            return true;
        }
        return false;
    },

    stopAllInlinePortrait() {
        document.querySelectorAll('.work-item--inline-playing').forEach((el) => {
            this.stopInlinePortrait(el);
        });
    },

    stopInlinePortrait(workItem) {
        if (!workItem) return;
        workItem.classList.remove('work-item--inline-playing');
        const video = workItem.querySelector('video');
        if (!video) return;
        video.removeAttribute('controls');
        video.pause();
        video.currentTime = 0;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
    },

    startInlinePortrait(workItem) {
        const video = workItem.querySelector('video');
        if (!video) return;

        this.stopAllInlinePortrait();
        if (this.modal && this.modal.classList.contains('active')) {
            this.close();
        }

        workItem.classList.add('work-item--inline-playing');

        let started = false;
        const tryPlay = () => {
            if (started) return;
            started = true;
            video.muted = false;
            video.loop = true;
            video.playsInline = true;
            video.setAttribute('controls', '');
            const p = video.play();
            if (p && typeof p.catch === 'function') {
                p.catch(() => {
                    video.muted = true;
                    video.play().catch(() => {});
                });
            }
        };

        if (video.readyState >= 2) {
            tryPlay();
        } else {
            const kick = () => tryPlay();
            video.addEventListener('loadeddata', kick, { once: true });
            video.addEventListener('canplay', kick, { once: true });
            window.setTimeout(() => tryPlay(), 2500);
        }
    },

    handleOverlayClick(e) {
        const btn = e.target.closest('.work-item-overlay');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const workItem = btn.closest('.work-item');
        if (!workItem) return;

        if (this.isPortraitWorkItem(workItem)) {
            this.startInlinePortrait(workItem);
            return;
        }

        const sourceEl = workItem.querySelector('video source');
        if (sourceEl && sourceEl.src) {
            this.open(sourceEl.src);
        }
    },

    init() {
        this.modal = document.getElementById('video-modal');
        this.modalVideo = document.getElementById('modal-video');

        if (!this.modal || !this.modalVideo) return;

        const closeBtn = this.queryModalClose();

        if (!closeBtn) return;

        document.body.addEventListener('click', this.handleOverlayClick.bind(this));

        document.addEventListener('click', (e) => {
            const inline = document.querySelector('.work-item--inline-playing');
            if (!inline) return;
            if (inline.contains(e.target)) return;
            VideoModal.stopInlinePortrait(inline);
        });

        closeBtn.addEventListener('click', () => this.close());

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const inline = document.querySelector('.work-item--inline-playing');
            if (inline) {
                e.preventDefault();
                this.stopInlinePortrait(inline);
                return;
            }
            if (this.modal.classList.contains('active')) {
                this.close();
            }
        });
    },

    open(src) {
        this.stopAllInlinePortrait();
        this.modalVideo.querySelector('source').src = src;
        this.modalVideo.load();
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        this.modalVideo.play();
    },

    close() {
        this.modal.classList.remove('active');
        document.body.style.overflow = '';
        this.modalVideo.pause();
        this.modalVideo.currentTime = 0;
    },

    queryModalClose() {
        return this.modal.querySelector('.modal-close');
    }
};

window.VideoModal = VideoModal;

/* ============================================
   SCROLL ANIMATIONS
   ============================================ */
const ScrollAnimations = {
    init() {
        const animatedElements = document.querySelectorAll(
            '.work-item, .service-card, .process-step, .testimonial-card, .section-header, .about-content, .about-visual, .contact-info, .contact-form, .tee-collab-cell, .tee-fade-block'
        );
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    // For section elements, add revealed class
                    entry.target.classList.add('revealed');
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });
        
        animatedElements.forEach(el => {
            observer.observe(el);
        });
    }
};

/* ============================================
   COUNT UP ANIMATION
   ============================================ */
const CountUp = {
    init() {
        const stats = document.querySelectorAll('.stat-number');
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.animate(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });
        
        stats.forEach(stat => observer.observe(stat));
    },
    
    animate(element) {
        const target = parseInt(element.dataset.count);
        const duration = 2000;
        const start = performance.now();
        
        const update = (currentTime) => {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = Math.floor(easeOutQuart * target);
            
            element.textContent = current;
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = target;
            }
        };
        
        requestAnimationFrame(update);
    }
};

/* ============================================
   CONTACT FORM
   ============================================ */
const ContactForm = {
    init() {
        const form = document.getElementById('contact-form');
        
        if (!form) return;
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = form.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            
            // Show loading state
            btn.innerHTML = '<span>Sending...</span>';
            btn.disabled = true;
            
            try {
                // Submit to Netlify Forms
                const formData = new FormData(form);
                const data = new URLSearchParams(formData).toString();
                
                const response = await fetch('/', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: data
                });
                
                // Show success message
                btn.innerHTML = '<span>Message Sent! ✓</span>';
                btn.style.background = '#22c55e';
                form.reset();
                
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.style.background = '';
                    btn.disabled = false;
                }, 3000);
                
            } catch (error) {
                console.error('Form error:', error);
                // Fallback: submit form normally (will redirect to thanks page)
                form.submit();
            }
        });
    }
};

/* ============================================
   QUOTE BUILDER
   ============================================ */
const QuoteBuilder = {
    config: {
        standard: {
            baseRates: {
                "half-day": 1500,
                "full-day": 3000
            },
            locations: {
                "2": 250,
                "3-plus": 500
            },
            crew: {
                "small": 500,
                "full": 1250
            },
            deliverables: {
                "2-3": 400,
                "4-6": 900,
                "7-plus": 1500
            },
            socialCutdowns: {
                "3": 150,
                "6": 300,
                "10": 450
            },
            urgency: {
                "rush": 500
            }
        },
        addOns: {
            "Drone": 250,
            "Captions": 120,
            "Voiceover": 200,
            "Scriptwriting": 350,
            "Location scouting": 200,
            "Rush edit": 500,
            "Photography add-on": 400
        },
        retainer: {
            tiers: {
                foundation: 2000,
                growth: 3500,
                "full-spectrum": 6000
            },
            sixMonthDiscount: 0.1
        }
    },
    init() {
        this.form = document.getElementById('quote-builder-form');
        if (!this.form) return;

        this.steps = Array.from(this.form.querySelectorAll('.quote-step'));
        this.currentStep = this.steps[0];
        this.stepCurrent = document.getElementById('quote-step-current');
        this.stepTotal = document.getElementById('quote-step-total');
        this.stepTitle = document.getElementById('quote-step-title');
        this.prevBtn = this.form.querySelector('.quote-prev');
        this.nextBtn = this.form.querySelector('.quote-next');
        this.submitBtn = this.form.querySelector('.quote-submit');
        this.summaryLists = document.querySelectorAll('.quote-summary-items');
        this.summaryTotals = document.querySelectorAll('.quote-summary-total');
        this.copyButtons = document.querySelectorAll('.quote-copy-btn');
        this.confirmation = document.getElementById('quote-confirmation');
        this.hiddenPricingPath = document.getElementById('pricing-path-hidden');
        this.hiddenTotal = document.getElementById('computed-total-hidden');
        this.hiddenLineItems = document.getElementById('line-items-hidden');
        this.hiddenQuoteText = document.getElementById('quote-text-hidden');

        this.form.addEventListener('input', (event) => this.handleInput(event));
        this.prevBtn.addEventListener('click', () => this.changeStep(-1));
        this.nextBtn.addEventListener('click', () => this.handleNext());
        this.form.addEventListener('submit', (event) => this.handleSubmit(event));

        this.copyButtons.forEach((btn) => {
            btn.addEventListener('click', () => this.copyQuote(btn));
        });

        this.updateSteps();
        this.updateEstimate();
    },
    handleInput(event) {
        if (event.target.name === 'pricingPathChoice') {
            this.updateSteps();
        }

        this.updateEstimate();
    },
    handleNext() {
        if (this.validateStep(this.currentStep)) {
            this.changeStep(1);
        }
    },
    changeStep(direction) {
        const activeSteps = this.getActiveSteps();
        const currentIndex = activeSteps.indexOf(this.currentStep);
        const nextIndex = Math.min(Math.max(currentIndex + direction, 0), activeSteps.length - 1);
        this.currentStep = activeSteps[nextIndex];
        this.updateSteps();
    },
    updateSteps() {
        const activeSteps = this.getActiveSteps();
        if (!activeSteps.includes(this.currentStep)) {
            this.currentStep = activeSteps[0];
        }

        this.steps.forEach((step) => {
            const isActive = activeSteps.includes(step);
            step.classList.toggle('is-active', step === this.currentStep);
            step.querySelectorAll('input, select, textarea').forEach((field) => {
                field.disabled = !isActive;
            });
        });

        const currentIndex = activeSteps.indexOf(this.currentStep);
        if (this.stepCurrent) {
            this.stepCurrent.textContent = `${currentIndex + 1}`;
        }
        if (this.stepTotal) {
            this.stepTotal.textContent = `${activeSteps.length}`;
        }
        if (this.stepTitle) {
            this.stepTitle.textContent = this.currentStep?.dataset.title || '';
        }

        if (this.prevBtn) {
            this.prevBtn.disabled = currentIndex <= 0;
        }
        const isLast = currentIndex === activeSteps.length - 1;
        if (this.nextBtn) {
            this.nextBtn.hidden = isLast;
        }
        if (this.submitBtn) {
            this.submitBtn.hidden = !isLast;
        }
    },
    getActiveSteps() {
        const pricingPath = this.getPricingPath();
        return this.steps.filter((step) => {
            const requires = step.dataset.requires;
            if (!requires) return true;
            return requires.split(',').map((value) => value.trim()).includes(pricingPath);
        });
    },
    getPricingPath() {
        const selected = this.form.querySelector('input[name="pricingPathChoice"]:checked');
        return selected ? selected.value : 'standard';
    },
    validateStep(step) {
        if (!step) return true;
        const fields = Array.from(step.querySelectorAll('input, select, textarea')).filter((field) => field.required);
        const checkedRadioGroups = new Set();

        for (const field of fields) {
            if (field.type === 'radio') {
                if (checkedRadioGroups.has(field.name)) {
                    continue;
                }
                checkedRadioGroups.add(field.name);
                const checked = step.querySelector(`input[name="${field.name}"]:checked`);
                if (!checked) {
                    field.reportValidity();
                    return false;
                }
            } else if (!field.checkValidity()) {
                field.reportValidity();
                return false;
            }
        }

        return true;
    },
    updateEstimate() {
        const data = this.getFormValues();
        const estimate = this.calculateEstimate(data);
        this.renderEstimate(estimate);
        this.updateHiddenFields(data, estimate);
    },
    getFormValues() {
        const addOns = Array.from(this.form.querySelectorAll('input[name="addOns"]:checked'))
            .map((input) => input.value);

        return {
            projectType: this.getFieldValue('projectType'),
            pricingPath: this.getPricingPath(),
            shootDuration: this.getFieldValue('shootDuration'),
            locationCount: this.getFieldValue('locationCount'),
            crewLevel: this.getFieldValue('crewLevel'),
            videoLength: this.getFieldValue('videoLength'),
            deliverablesCount: this.getFieldValue('deliverablesCount'),
            socialCutdowns: this.getFieldValue('socialCutdowns'),
            addOns,
            timelineUrgency: this.getFieldValue('timelineUrgency'),
            retainerTier: this.getFieldValue('retainerTier'),
            retainerCommitment: this.getFieldValue('retainerCommitment'),
            retainerNotes: this.getFieldValue('retainerNotes')
        };
    },
    getFieldValue(name) {
        const field = this.form.querySelector(`[name="${name}"]`);
        if (!field) return '';
        if (field.type === 'radio') {
            const selected = this.form.querySelector(`input[name="${name}"]:checked`);
            return selected ? selected.value : '';
        }
        return field.value;
    },
    calculateEstimate(data) {
        const lineItems = [];
        let total = 0;

        if (data.pricingPath === 'retainer') {
            const tierKey = this.normalizeTier(data.retainerTier);
            const base = this.config.retainer.tiers[tierKey] || 0;
            if (base) {
                lineItems.push({
                    label: `${data.retainerTier || 'Retainer tier'} (per month)`,
                    amount: base
                });
            }

            let discount = 0;
            if (data.retainerCommitment === '6-months') {
                discount = base * this.config.retainer.sixMonthDiscount;
                if (discount) {
                    lineItems.push({
                        label: '6-month commitment discount (10%)',
                        amount: -discount
                    });
                }
            }

            const monthlyTotal = base - discount;
            if (monthlyTotal) {
                lineItems.push({ label: 'Monthly total', amount: monthlyTotal });
                lineItems.push({ label: '3-month total', amount: monthlyTotal * 3 });
                lineItems.push({ label: '6-month total', amount: monthlyTotal * 6 });
            }

            total = monthlyTotal;
            return { lineItems, total };
        }

        const baseRate = this.config.standard.baseRates[data.shootDuration] || 0;
        if (baseRate) {
            const label = data.shootDuration === 'half-day'
                ? 'Half day shoot (up to 4 hours)'
                : 'Full day shoot (up to 8 hours)';
            lineItems.push({ label, amount: baseRate });
            total += baseRate;
        }

        const locationAdd = this.config.standard.locations[data.locationCount] || 0;
        if (locationAdd) {
            lineItems.push({ label: 'Additional locations', amount: locationAdd });
            total += locationAdd;
        }

        const crewAdd = this.config.standard.crew[data.crewLevel] || 0;
        if (crewAdd) {
            const label = data.crewLevel === 'small' ? 'Small crew (2–3)' : 'Full crew (4+)';
            lineItems.push({ label, amount: crewAdd });
            total += crewAdd;
        }

        const deliverableAdd = this.config.standard.deliverables[data.deliverablesCount] || 0;
        if (deliverableAdd) {
            lineItems.push({ label: 'Additional deliverables', amount: deliverableAdd });
            total += deliverableAdd;
        }

        const cutdownAdd = this.config.standard.socialCutdowns[data.socialCutdowns] || 0;
        if (cutdownAdd) {
            lineItems.push({ label: 'Social cutdowns', amount: cutdownAdd });
            total += cutdownAdd;
        }

        data.addOns.forEach((addOn) => {
            const addOnCost = this.config.addOns[addOn] || 0;
            if (addOnCost) {
                lineItems.push({ label: addOn, amount: addOnCost });
                total += addOnCost;
            }
        });

        const urgencyAdd = this.config.standard.urgency[data.timelineUrgency] || 0;
        if (urgencyAdd) {
            lineItems.push({ label: 'Rush timeline', amount: urgencyAdd });
            total += urgencyAdd;
        }

        return { lineItems, total };
    },
    renderEstimate(estimate) {
        const itemsMarkup = estimate.lineItems.length
            ? estimate.lineItems.map((item) => {
                return `<li><span>${item.label}</span><strong>${this.formatCurrency(item.amount)}</strong></li>`;
            }).join('')
            : '<li class="quote-summary-empty">Choose options to see your estimate.</li>';

        this.summaryLists.forEach((list) => {
            list.innerHTML = itemsMarkup;
        });

        const totalText = this.formatCurrency(estimate.total || 0);
        this.summaryTotals.forEach((total) => {
            total.textContent = totalText;
        });
    },
    updateHiddenFields(data, estimate) {
        const quoteText = this.buildQuoteText(data, estimate);
        this.latestQuoteText = quoteText;

        if (this.hiddenPricingPath) {
            this.hiddenPricingPath.value = data.pricingPath;
        }
        if (this.hiddenTotal) {
            this.hiddenTotal.value = estimate.total || 0;
        }
        if (this.hiddenLineItems) {
            this.hiddenLineItems.value = JSON.stringify(estimate.lineItems);
        }
        if (this.hiddenQuoteText) {
            this.hiddenQuoteText.value = quoteText;
        }
    },
    buildQuoteText(data, estimate) {
        const lines = ['Film Stop Estimate'];

        if (data.projectType) {
            lines.push(`Project Type: ${data.projectType}`);
        }
        lines.push(`Pricing Path: ${this.formatPricingPath(data.pricingPath)}`);

        if (data.pricingPath === 'retainer') {
            if (data.retainerTier) {
                lines.push(`Retainer Tier: ${data.retainerTier}`);
            }
            if (data.retainerCommitment) {
                lines.push(`Commitment: ${data.retainerCommitment}`);
            }
            if (data.retainerNotes) {
                lines.push(`Retainer Notes: ${data.retainerNotes}`);
            }
        } else {
            if (data.shootDuration) lines.push(`Shoot Duration: ${data.shootDuration}`);
            if (data.locationCount) lines.push(`Locations: ${data.locationCount}`);
            if (data.crewLevel) lines.push(`Crew Level: ${data.crewLevel}`);
            if (data.videoLength) lines.push(`Final Length: ${data.videoLength}`);
            if (data.deliverablesCount) lines.push(`Deliverables: ${data.deliverablesCount}`);
            if (data.socialCutdowns) lines.push(`Social Cutdowns: ${data.socialCutdowns}`);
            if (data.addOns.length) lines.push(`Add-ons: ${data.addOns.join(', ')}`);
            if (data.timelineUrgency) lines.push(`Urgency: ${data.timelineUrgency}`);
        }

        lines.push('', 'Line Items:');
        if (!estimate.lineItems.length) {
            lines.push('Pending estimate selections.');
        } else {
            estimate.lineItems.forEach((item) => {
                lines.push(`- ${item.label}: ${this.formatCurrency(item.amount)}`);
            });
        }

        lines.push(`Total: ${this.formatCurrency(estimate.total || 0)}`);
        lines.push('Final pricing confirmed after discovery call.');

        return lines.join('\n');
    },
    formatCurrency(amount) {
        const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(Math.abs(amount));
        return amount < 0 ? `-${formatted}` : formatted;
    },
    formatPricingPath(path) {
        switch (path) {
            case 'retainer':
                return 'Monthly Retainer';
            default:
                return 'Standard Project';
        }
    },
    normalizeTier(tier) {
        if (!tier) return '';
        return tier.toLowerCase().replace(/\s+/g, '-');
    },
    async copyQuote(button) {
        if (!this.latestQuoteText) return;
        const originalText = button.textContent;

        try {
            await navigator.clipboard.writeText(this.latestQuoteText);
            button.textContent = 'Copied!';
        } catch (error) {
            const textarea = document.createElement('textarea');
            textarea.value = this.latestQuoteText;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            button.textContent = 'Copied!';
        }

        setTimeout(() => {
            button.textContent = originalText;
        }, 2000);
    },
    async handleSubmit(event) {
        event.preventDefault();

        if (!this.validateAllSteps()) {
            return;
        }

        const originalText = this.submitBtn.innerHTML;
        this.submitBtn.innerHTML = '<span>Submitting...</span>';
        this.submitBtn.disabled = true;

        try {
            const formData = new FormData(this.form);
            const data = new URLSearchParams(formData).toString();

            await fetch('/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: data
            });

            if (this.confirmation) {
                this.confirmation.classList.remove('hidden');
            }
            this.submitBtn.innerHTML = '<span>Submitted ✓</span>';
        } catch (error) {
            console.error('Quote form error:', error);
            this.form.submit();
        } finally {
            setTimeout(() => {
                if (this.submitBtn) {
                    this.submitBtn.innerHTML = originalText;
                    this.submitBtn.disabled = false;
                }
            }, 3000);
        }
    },
    validateAllSteps() {
        const activeSteps = this.getActiveSteps();
        for (const step of activeSteps) {
            if (!this.validateStep(step)) {
                this.currentStep = step;
                this.updateSteps();
                return false;
            }
        }
        return true;
    }
};

/* ============================================
   PARALLAX EFFECTS
   ============================================ */
const Parallax = {
    init() {
        window.addEventListener('scroll', () => {
            const scrolled = window.scrollY;
            
            // Hero parallax
            const heroVideo = document.querySelector('.hero-video-container');
            if (heroVideo && scrolled < window.innerHeight) {
                heroVideo.style.transform = `translateY(${scrolled * 0.3}px)`;
            }
        });
    }
};

// Initialize Parallax
Parallax.init();

