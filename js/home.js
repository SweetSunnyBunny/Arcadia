document.body.classList.add('page-enter');

(function () {
    const nav = document.getElementById('navbar');
    const navLinks = document.querySelector('.nav-links');
    const navToggle = document.querySelector('.nav-mobile-toggle');
    const hero = document.querySelector('.hero');
    const heroParallaxTargets = hero ? hero.querySelectorAll('.parallax-target') : [];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (nav && navLinks && navToggle) {
        const closeMenu = () => {
            navLinks.classList.remove('open');
            navToggle.setAttribute('aria-expanded', 'false');
        };

        navToggle.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('open');
            navToggle.setAttribute('aria-expanded', String(isOpen));
        });

        document.addEventListener('click', (event) => {
            if (!nav.contains(event.target)) {
                closeMenu();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeMenu();
            }
        });

        navLinks.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', closeMenu);
        });
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.14 });

    document.querySelectorAll('.fade-in, .stagger-in, .divider-animated').forEach((element) => {
        observer.observe(element);
    });

    window.addEventListener('scroll', () => {
        if (nav) {
            nav.classList.toggle('scrolled', window.scrollY > 24);
        }
    }, { passive: true });

    const sectionLinks = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));
    const sections = sectionLinks
        .map((link) => {
            const id = link.getAttribute('href').slice(1);
            return { link, section: document.getElementById(id) };
        })
        .filter((entry) => entry.section);

    if (sections.length) {
        const navObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                const match = sections.find((item) => item.section === entry.target);
                if (!match) {
                    return;
                }

                sectionLinks.forEach((link) => link.classList.remove('active'));
                match.link.classList.add('active');
            });
        }, { threshold: 0.35, rootMargin: '-96px 0px -45% 0px' });

        sections.forEach((entry) => navObserver.observe(entry.section));
    }

    if (!reduceMotion && hero && heroParallaxTargets.length) {
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            const heroHeight = hero.offsetHeight;

            if (scrollY > heroHeight) {
                return;
            }

            const ratio = scrollY / heroHeight;
            heroParallaxTargets.forEach((element, index) => {
                const speed = 0.05 + index * 0.02;
                element.style.transform = `translateY(${scrollY * speed}px)`;
                element.style.opacity = String(1 - ratio * 0.7);
            });
        }, { passive: true });
    }
})();

(function () {
    const canvas = document.getElementById('vine-canvas');
    if (!canvas) {
        return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const compactViewport = window.matchMedia('(max-width: 768px)').matches;
    if (reduceMotion || compactViewport) {
        return;
    }

    const hero = canvas.closest('.hero');
    const ctx = canvas.getContext('2d');
    const nodes = [];
    const mouse = { x: -1000, y: -1000 };
    const nodeCount = Math.min(82, Math.floor(window.innerWidth / 18));
    let width = 0;
    let height = 0;
    let connectDistance = 180;
    let rafId = 0;

    const resize = () => {
        width = canvas.width = canvas.offsetWidth;
        height = canvas.height = canvas.offsetHeight;
        connectDistance = Math.min(250, Math.max(150, width / 5));
    };

    const seedNodes = () => {
        nodes.length = 0;
        for (let index = 0; index < nodeCount; index += 1) {
            const isGold = Math.random() < 0.28;
            nodes.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.28,
                vy: (Math.random() - 0.5) * 0.28,
                radius: Math.random() * 2 + 1,
                color: isGold ? [200, 168, 78] : [74, 140, 74],
                phase: Math.random() * Math.PI * 2
            });
        }
    };

    const render = () => {
        ctx.clearRect(0, 0, width, height);
        const time = Date.now();

        for (let index = 0; index < nodes.length; index += 1) {
            const node = nodes[index];

            node.x += node.vx + Math.sin(time * 0.0005 + node.phase) * 0.15;
            node.y += node.vy + Math.cos(time * 0.0004 + node.phase) * 0.12;

            if (node.x < -20) node.x = width + 20;
            if (node.x > width + 20) node.x = -20;
            if (node.y < -20) node.y = height + 20;
            if (node.y > height + 20) node.y = -20;

            const mouseDx = node.x - mouse.x;
            const mouseDy = node.y - mouse.y;
            const mouseDistance = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy);
            const mouseGlow = Math.max(0, 1 - mouseDistance / 200);

            for (let inner = index + 1; inner < nodes.length; inner += 1) {
                const target = nodes[inner];
                const deltaX = node.x - target.x;
                const deltaY = node.y - target.y;
                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                if (distance >= connectDistance) {
                    continue;
                }

                const alpha = (1 - distance / connectDistance) * 0.15 + mouseGlow * 0.1;
                const midX = (node.x + target.x) / 2 + Math.sin(time * 0.001 + index) * 8;
                const midY = (node.y + target.y) / 2 + Math.cos(time * 0.001 + inner) * 8;

                ctx.beginPath();
                ctx.moveTo(node.x, node.y);
                ctx.quadraticCurveTo(midX, midY, target.x, target.y);
                ctx.strokeStyle = `rgba(${node.color.join(',')}, ${alpha})`;
                ctx.lineWidth = 0.5 + mouseGlow * 0.5;
                ctx.stroke();
            }

            const nodeAlpha = 0.3 + mouseGlow * 0.5 + Math.sin(time * 0.002 + node.phase) * 0.1;
            const glowRadius = node.radius + mouseGlow * 3;

            ctx.beginPath();
            ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${node.color.join(',')}, ${nodeAlpha * 0.3})`;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${node.color.join(',')}, ${nodeAlpha})`;
            ctx.fill();
        }

        rafId = window.requestAnimationFrame(render);
    };

    resize();
    seedNodes();
    render();

    window.addEventListener('resize', () => {
        resize();
        seedNodes();
    });

    if (hero) {
        hero.addEventListener('mousemove', (event) => {
            const rect = canvas.getBoundingClientRect();
            mouse.x = event.clientX - rect.left;
            mouse.y = event.clientY - rect.top;
        });

        hero.addEventListener('mouseleave', () => {
            mouse.x = -1000;
            mouse.y = -1000;
        });
    }

    window.addEventListener('pagehide', () => {
        window.cancelAnimationFrame(rafId);
    });
})();
