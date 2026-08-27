import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EffectComposer, RenderPass, EffectPass, BloomEffect } from 'postprocessing';
import { animate } from 'motion';
import Lenis from 'lenis';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

gsap.registerPlugin(ScrollTrigger);

// ═══════════════════════════════════════════
// VANILLA KINETIC TEXT SPLITTER
// ═══════════════════════════════════════════
function splitText(selector) {
  document.querySelectorAll(selector).forEach(el => {
    const text = el.innerText;
    el.innerHTML = '';
    text.split(' ').forEach(word => {
      const wordSpan = document.createElement('span');
      wordSpan.style.display = 'inline-block';
      wordSpan.style.overflow = 'hidden';
      wordSpan.style.verticalAlign = 'top';
      wordSpan.style.marginRight = '0.25em';
      
      const innerSpan = document.createElement('span');
      innerSpan.style.display = 'inline-block';
      innerSpan.innerText = word;
      innerSpan.classList.add('word-inner');
      
      wordSpan.appendChild(innerSpan);
      el.appendChild(wordSpan);
    });
  });
}

// ═══════════════════════════════════════════
// SMOOTH SCROLLING (LENIS)
// ═══════════════════════════════════════════
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  direction: 'vertical',
  smooth: true,
});

lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => { lenis.raf(time * 1000); });
gsap.ticker.lagSmoothing(0);


// ═══════════════════════════════════════════
// THREE.JS + CUSTOM SHADERS + SVG LOGO
// ═══════════════════════════════════════════

class WebGLApp {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    
    // Orthographic Camera for pixel-perfect UI syncing
    this.camera = new THREE.OrthographicCamera(0, window.innerWidth, window.innerHeight, 0, 0.1, 2000);
    this.camera.position.z = 1000;

    // Cinematic Lighting for Glossy Plastic
    const ambientLight = new THREE.AmbientLight(0xffffff, 2);
    this.scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(200, 200, 500);
    this.scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0xf9a8d4, 1.5); // Soft pink rim
    rimLight.position.set(-200, -200, 100);
    this.scene.add(rimLight);
    
    const rimLight2 = new THREE.DirectionalLight(0x93C5FD, 1.5); // Soft blue rim
    rimLight2.position.set(200, -200, -100);
    this.scene.add(rimLight2);

    // Postprocessing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new EffectPass(this.camera, new BloomEffect({ intensity: 0.4, luminanceThreshold: 0.8 })));

    this.objects = [];
    
    this.createBackgroundShader();
    this.loadExtrudedLogo();
    
    this.resize();
    window.addEventListener('resize', () => this.resize());
    lenis.on('scroll', () => this.updatePositions());
    
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.render());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    
    this.updatePositions();
  }

  // 1. ADVANCED FLUID SHADER BACKGROUND (API DATA STREAM)
  createBackgroundShader() {
     // Background removed per user request
  }

  setTheme(isDark) {
    const heroColor = isDark ? 0xFFFFFF : 0x000000;
    this.objects.forEach(obj => {
      if (obj.isHero) {
        obj.mesh.traverse(child => {
          if (child.isMesh) {
            child.material = this.createPlasticMaterial(heroColor);
          }
        });
      }
    });
  }

  // Heavy, solid glossy plastic material
  createPlasticMaterial(color) {
    const isDark = (color === 0x000000 || color === 0);
    const frontMat = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide
    });
    
    const sideMat = new THREE.MeshPhongMaterial({
      color: color,
      specular: isDark ? 0x666666 : 0xFFFFFF,
      shininess: 80,
      side: THREE.DoubleSide
    });

    return [frontMat, sideMat];
  }
  loadExtrudedLogo() {
    const loader = new SVGLoader();
    
    loader.load('/scp-logo-user.svg', (data) => {
      const paths = data.paths;
      const group = new THREE.Group();
      
      // Extrusion settings for a thick, solid block
      const extrudeSettings = {
        depth: 10, 
        bevelEnabled: true,
        bevelThickness: 1,
        bevelSize: 0.5,
        bevelSegments: 3,
        curveSegments: 24 
      };

      // Create a unified plastic material (Pure Black Obsidian)
      const plasticMat = this.createPlasticMaterial(0x000000);

      // Parse the SVG paths into 3D geometry
      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        
        // Skip paths with no fill or bounding issues if necessary
        const shapes = SVGLoader.createShapes(path);

        for (let j = 0; j < shapes.length; j++) {
          const shape = shapes[j];
          const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          const mesh = new THREE.Mesh(geometry, plasticMat);
          group.add(mesh);
        }
      }

      // Center the Extruded SVG Group
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      
      // Normalize group so it scales predictably (make its max dimension exactly 50 units)
      const maxDim = Math.max(size.x, size.y);
      const normalizedScale = 50 / maxDim;
      
      // Re-center children around the origin
      group.children.forEach(mesh => {
        mesh.position.x = -center.x;
        mesh.position.y = -center.y;
        mesh.position.z = -center.z;
        // Invert Y because SVG coordinates are top-left, WebGL is bottom-left
        mesh.scale.y = -1; 
      });

      // Wrap in a parent group to apply the scale
      const normalizedGroup = new THREE.Group();
      normalizedGroup.add(group);
      normalizedGroup.scale.setScalar(normalizedScale);

      // Wrapper group so updatePositions can scale the outer container without destroying the normalization
      const wrapperGroup = new THREE.Group();
      wrapperGroup.add(normalizedGroup);

      this.logoMaster = wrapperGroup;
      
      // Distribute Logos across UI
      this.initObjects();
    });
  }

  initObjects() {
    if(!this.logoMaster) return; // Wait for SVG to load

    const isDark = document.body.classList.contains('theme-dark');
    const heroColor = isDark ? 0xFFFFFF : 0x000000;

    // 1. Hero SCP Logo
    const heroLogo = this.logoMaster.clone();
    heroLogo.traverse(child => {
      if (child.isMesh) {
        child.material = this.createPlasticMaterial(heroColor);
      }
    });
    this.scene.add(heroLogo);
    this.objects.push({ mesh: heroLogo, domId: '3d-hero-keychain', isHero: true });

    // 2. We don't have explicit DOM IDs for the massive 12-card grid geometries anymore,
    // so we can dynamically inject small floating logos into any .squircle-card
    const cards = document.querySelectorAll('.dark-section .squircle-card');
    cards.forEach((card, idx) => {
       // Create a temporary ID if it doesn't have one
       const cardId = 'card-logo-' + idx;
       card.id = card.id || cardId;
       
       const cardLogo = this.logoMaster.clone();
       // Make them a lighter plastic color for contrast in the dark section
       cardLogo.children[0].children.forEach(mesh => {
         mesh.material = this.createPlasticMaterial(0xFFFFFF);
       });

       this.scene.add(cardLogo);
       this.objects.push({ mesh: cardLogo, domId: card.id, isHero: false, randSpeed: 0.5 + Math.random() });
    });
    
    this.updatePositions();
  }

  updatePositions() {
    const scrollY = window.scrollY;
    // Intense Camera Parallax
    this.camera.position.y = -(scrollY * 0.1);
    
    this.objects.forEach(obj => {
      const el = document.getElementById(obj.domId);
      if (!el) {
         obj.mesh.visible = false;
         return;
      }
      obj.mesh.visible = true;
      
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      
      // Map to absolute Ortho Coordinates factoring in camera position
      const absoluteY = window.innerHeight - cy + this.camera.position.y;
      
      obj.mesh.position.x = cx;
      obj.mesh.position.y = absoluteY;
      
      const targetScale = rect.height / 40; 
      
      if(obj.isHero) {
         obj.mesh.scale.setScalar(targetScale * 1.5);
         obj.mesh.position.z = 150; 
      } else {
         // Scale down the card logos so they fit nicely as background accents
         obj.mesh.scale.setScalar(targetScale * 0.4);
         obj.mesh.position.z = 50;
      }
    });
  }

  render() {
    const time = this.clock.getElapsedTime();
    
    if (this.bgUniforms) {
      this.bgUniforms.uTime.value = time;
    }

    // Scroll-linked Spin Physics
    const scrollY = window.scrollY;
    const spinTarget = scrollY * 0.005;

    this.objects.forEach((obj, idx) => {
      // Lerp rotation towards the scroll target for physics smoothness
      if (obj.isHero) {
         obj.mesh.rotation.y += (spinTarget - obj.mesh.rotation.y) * 0.1;
         obj.mesh.rotation.x = Math.sin(time) * 0.1;
      } else {
         // Card logos spin freely based on time and scroll
         obj.mesh.rotation.x = time * obj.randSpeed;
         obj.mesh.rotation.y = time * 0.3 + spinTarget;
         obj.mesh.rotation.z = time * 0.2;
      }
    });

    this.updatePositions();
    this.composer.render();
  }
}

// ═══════════════════════════════════════════
// BOOTSTRAP & GSAP KINETIC MOTION
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  window.webglApp = new WebGLApp();
  
  splitText('.t-display');

  // Intense Kinetic Text Reveal
  gsap.from(".t-display .word-inner", {
    y: "120%",
    rotationZ: 5,
    opacity: 0,
    duration: 1.2,
    stagger: 0.05,
    ease: "expo.out",
    delay: 0.1
  });

  gsap.from("#app p, #app .hero-btn", {
    y: 40, opacity: 0, duration: 1, stagger: 0.1, ease: "power4.out", delay: 0.8
  });

  // Stagger the 12-Card Bento Grid
  gsap.from(".squircle-card", {
    scrollTrigger: {
      trigger: ".dark-section",
      start: "top 80%",
    },
    y: 150,
    scale: 0.9,
    opacity: 0,
    duration: 1.2,
    stagger: 0.1,
    ease: "expo.out"
  });

  // Advanced UI Physics (Motion) - Mouse Tracking
  const cards = document.querySelectorAll('.squircle-card');
  cards.forEach(card => {
    card.style.perspective = '1000px';
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left; 
      const y = e.clientY - rect.top;  
      const tiltX = (((y - rect.height / 2) / (rect.height / 2)) * -10); 
      const tiltY = (((x - rect.width / 2) / (rect.width / 2)) * 10);
      
      animate(card, { rotateX: tiltX, rotateY: tiltY, scale: 1.02 }, { type: 'spring', stiffness: 300, damping: 30 });
    });
    
    card.addEventListener('mouseleave', () => {
      animate(card, { rotateX: 0, rotateY: 0, scale: 1 }, { type: 'spring', stiffness: 300, damping: 30 });
    });
  });

  // ═══════════════════════════════════════════
  // BACKEND INTEGRATION & THEME SWITCHER
  // ═══════════════════════════════════════════
  const API_BASE = window.location.hostname.includes('localhost') 
    ? '' 
    : 'https://scp-automation-1.onrender.com';
  
  // 1. Theme Switcher (Navbar)
  const navThemeToggle = document.getElementById('nav-theme-toggle');
  if (navThemeToggle) {
    navThemeToggle.addEventListener('click', () => {
       document.body.classList.toggle('theme-dark');
       const isDark = document.body.classList.contains('theme-dark');
       if (window.webglApp) {
           window.webglApp.setTheme(isDark);
       }
    });
  }

  // 2. Master Control (Gmail Bot)
  const botToggle = document.getElementById('bot-active-toggle');
  const botText = document.getElementById('bot-custom-text');
  const saveBtn = document.getElementById('save-config-btn');
  const saveStatus = document.getElementById('save-status');
  
  const statusText = document.getElementById('engine-status-text');
  const lastCheckText = document.getElementById('engine-last-check');

  // Load existing config
  fetch(`${API_BASE}/api/config`)
    .then(res => res.json())
    .then(data => {
        if(botToggle) botToggle.checked = !!data.active;
        if(botText) botText.value = data.customText || '';
    }).catch(e => console.log("Backend offline or booting...", e));

  if(saveBtn) {
    saveBtn.addEventListener('click', () => {
       const payload = {
          active: botToggle.checked,
          customText: botText.value
       };
       saveBtn.innerText = "Deploying...";
       fetch(`${API_BASE}/api/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
       }).then(res => res.json())
         .then(data => {
            saveBtn.innerText = "Save Configuration";
            saveStatus.style.display = 'block';
            setTimeout(() => { saveStatus.style.display = 'none'; }, 3000);
         }).catch(e => {
            saveBtn.innerText = "Error (See Console)";
            console.error(e);
         });
    });
  }

  // Poll Engine Status
  setInterval(() => {
      fetch(`${API_BASE}/api/status`)
      .then(res => res.json())
      .then(data => {
          if (statusText) {
              if (data.isRunning) {
                  statusText.innerText = "Online (Processed: " + data.messagesProcessed + ")";
                  statusText.style.color = "#10B981"; // Green
              } else {
                  statusText.innerText = "Offline: " + (data.error || "Disabled");
                  statusText.style.color = "#EF4444"; // Red
              }
          }
          if (lastCheckText && data.lastChecked) {
              lastCheckText.innerText = "Last checked: " + new Date(data.lastChecked).toLocaleTimeString();
          }
      }).catch(() => {});
  }, 3000);

  // 3. Credentials Upload Form
  const uploadForm = document.getElementById('credentials-upload-form');
  const uploadStatus = document.getElementById('upload-status');
  if (uploadForm) {
      uploadForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const formData = new FormData(uploadForm);
          const files = document.getElementById('credentials-file').files;
          
          if (files.length === 0) {
              uploadStatus.innerText = "Please select files first.";
              uploadStatus.style.color = "#EF4444";
              uploadStatus.style.display = 'block';
              return;
          }
          
          uploadStatus.innerText = "Uploading...";
          uploadStatus.style.color = "var(--text-100)";
          uploadStatus.style.display = 'block';
          
          fetch(`${API_BASE}/api/upload-credentials`, {
              method: 'POST',
              body: formData
          })
          .then(res => res.json())
          .then(data => {
              if (data.success) {
                  uploadStatus.innerText = "Success! Credentials saved.";
                  uploadStatus.style.color = "#10B981";
              } else {
                  uploadStatus.innerText = "Error: " + data.error;
                  uploadStatus.style.color = "#EF4444";
              }
          })
          .catch(err => {
              uploadStatus.innerText = "Error uploading files.";
              uploadStatus.style.color = "#EF4444";
          });
      });
  }

  // 4. Instructions Modal
  const instrBtn = document.getElementById('show-instructions-btn');
  const instrModal = document.getElementById('instructions-modal');
  const closeBtn = document.getElementById('close-modal-btn');
  
  if (instrBtn && instrModal && closeBtn) {
      instrBtn.addEventListener('click', () => instrModal.style.display = 'flex');
      closeBtn.addEventListener('click', () => instrModal.style.display = 'none');
  }
});
