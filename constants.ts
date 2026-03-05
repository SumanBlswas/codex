
import { VirtualElement, ElementType } from './types';

export const INITIAL_ROOT: VirtualElement = {
  id: 'root',
  type: 'div',
  name: 'Body',
  styles: {
    width: '100%',
    height: '100%',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, sans-serif',
    overflowY: 'auto'
  },
  children: [
    {
      id: 'section-hero',
      type: 'section',
      name: 'Hero Section',
      styles: {
        width: '100%',
        minHeight: '400px',
        backgroundColor: '#1e1b4b',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        gap: '20px',
        color: 'white'
      },
      children: [
        {
          id: 'heading-1',
          type: 'h1',
          name: 'Main Heading',
          content: 'Welcome to NoCode X',
          styles: {
            fontSize: '48px',
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: '10px'
          },
          children: []
        },
        {
          id: 'text-intro',
          type: 'p',
          name: 'Intro Text',
          content: 'Build stunning websites without writing a single line of code.',
          styles: {
            fontSize: '18px',
            textAlign: 'center',
            maxWidth: '600px',
            lineHeight: '1.6',
            color: '#c7d2fe'
          },
          children: []
        },
        {
          id: 'btn-cta',
          type: 'button',
          name: 'CTA Button',
          content: 'Get Started',
          styles: {
            padding: '12px 32px',
            backgroundColor: '#4338ca',
            color: 'white',
            borderRadius: '8px',
            border: 'none',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.2s ease'
          },
          children: []
        }
      ]
    }
  ]
};

export const INITIAL_SCRIPTS = `
`;

export const ANIMATIONS = [
  { label: 'None', value: '' },
  { label: 'Fade In', value: 'fadeIn 0.5s ease-in' },
  { label: 'Slide Up', value: 'slideUp 0.5s ease-out' },
  { label: 'Zoom In', value: 'zoomIn 0.5s ease-out' },
  { label: 'Bounce', value: 'bounce 1s infinite' },
  { label: 'Pulse', value: 'pulse 2s infinite' },
  { label: 'Spin', value: 'spin 1s linear infinite' },
  { label: 'Flip', value: 'flip 0.6s ease-in-out' },
  { label: 'Wiggle', value: 'wiggle 0.5s ease-in-out infinite' },
  { label: 'Reveal On Scroll', value: 'revealScroll 1s forwards' },
];

export const INJECTED_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap');

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
}

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes zoomIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes flip { 0% { transform: perspective(400px) rotateY(90deg); opacity: 0; } 100% { transform: perspective(400px) rotateY(0deg); opacity: 1; } }
@keyframes wiggle { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
@keyframes revealScroll { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
`;

export const INJECTED_SCRIPTS = `
// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
});

// Scroll reveal observer
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.animation = 'revealScroll 0.6s ease-out forwards';
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('[data-scroll-reveal]').forEach(el => observer.observe(el));
`;