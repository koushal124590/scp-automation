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

    // Clear existing objects
    this.objects.forEach(obj => this.scene.remove(obj.mesh));
    this.objects = [];

    // 3D Rotating Logo for Gateway, Admin Passcode, User Dashboard, and Admin Dashboard
    const containers = [
      { id: '3d-hero-keychain', scaleMult: 1.5 },
      { id: '3d-passcode-keychain', scaleMult: 1.3 },
      { id: '3d-user-keychain', scaleMult: 1.2 },
      { id: '3d-admin-keychain', scaleMult: 1.2 }
    ];

    containers.forEach(item => {
      const logoMesh = this.logoMaster.clone();
      logoMesh.traverse(child => {
        if (child.isMesh) {
          child.material = this.createPlasticMaterial(heroColor);
        }
      });
      this.scene.add(logoMesh);
      this.objects.push({ mesh: logoMesh, domId: item.id, scaleMult: item.scaleMult });
    });
    
    this.updatePositions();
  }

  updatePositions() {
    const scrollY = window.scrollY;
    this.camera.position.y = -(scrollY * 0.1);
    
    this.objects.forEach(obj => {
      const el = document.getElementById(obj.domId);
      // Check if container exists and is visible in DOM
      if (!el || el.offsetParent === null) {
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
      
      const targetScale = (rect.height || 140) / 40; 
      obj.mesh.scale.setScalar(targetScale * (obj.scaleMult || 1.2));
      obj.mesh.position.z = 150; 
    });
  }

  render() {
    const time = this.clock.getElapsedTime();
    
    if (this.bgUniforms) {
      this.bgUniforms.uTime.value = time;
    }

    // Scroll-linked & continuous dynamic 3D rotation
    const scrollY = window.scrollY;
    const spinTarget = scrollY * 0.005;

    this.objects.forEach((obj) => {
      if (obj.mesh.visible) {
        obj.mesh.rotation.y += 0.012 + (spinTarget * 0.02);
        obj.mesh.rotation.x = Math.sin(time * 1.5) * 0.12;
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
  // ═══════════════════════════════════════════
  // BACKEND INTEGRATION, PORTALS & THEME SWITCHER
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

  // 2. Gateway & Dual Portal Router
  const gatewayView = document.getElementById('gateway-view');
  const adminPasscodeView = document.getElementById('admin-passcode-view');
  const userPortalView = document.getElementById('user-portal-view');
  const adminPortalView = document.getElementById('admin-portal-view');
  const navPortalLinks = document.getElementById('nav-portal-links');
  const navSignOutBtn = document.getElementById('nav-sign-out-btn');
  const navHomeBtn = document.getElementById('nav-home-btn');

  const tabUser = document.getElementById('tab-user-portal');
  const tabAdmin = document.getElementById('tab-admin-portal');

  const passcodeForm = document.getElementById('passcode-form-container');
  const passcodeVerified = document.getElementById('passcode-verified-container');
  const adminPasscodeInput = document.getElementById('admin-passcode-input');
  const adminPasscodeError = document.getElementById('admin-passcode-error');
  const adminPasscodeVerifyBtn = document.getElementById('admin-passcode-verify-btn');
  const gatewayEnterAdminBtn = document.getElementById('gateway-enter-admin-btn');
  const gatewayAdminDocsBtn = document.getElementById('gateway-admin-docs-btn');
  const exitPortalBtns = document.querySelectorAll('.exit-portal-btn');

  function openPortal(portal) {
    if (portal === 'admin') {
      if (gatewayView) gatewayView.style.display = 'none';
      if (adminPasscodeView) adminPasscodeView.style.display = 'none';
      if (userPortalView) userPortalView.style.display = 'none';
      if (adminPortalView) adminPortalView.style.display = 'block';
      if (navPortalLinks) navPortalLinks.style.display = 'flex';
      if (navSignOutBtn) navSignOutBtn.style.display = 'inline-flex';
      if (tabAdmin) { tabAdmin.style.display = 'inline-block'; tabAdmin.classList.add('active'); }
      if (tabUser) { tabUser.style.display = 'inline-block'; tabUser.classList.remove('active'); }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (portal === 'admin-passcode') {
      if (gatewayView) gatewayView.style.display = 'none';
      if (userPortalView) userPortalView.style.display = 'none';
      if (adminPortalView) adminPortalView.style.display = 'none';
      if (adminPasscodeView) adminPasscodeView.style.display = 'block';
      if (navPortalLinks) navPortalLinks.style.display = 'none';
      if (navSignOutBtn) navSignOutBtn.style.display = 'none';
      
      // Reset passcode view state
      if (passcodeForm) passcodeForm.style.display = 'block';
      if (passcodeVerified) passcodeVerified.style.display = 'none';
      if (adminPasscodeInput) {
        adminPasscodeInput.value = '';
        adminPasscodeInput.classList.remove('shake-input');
        adminPasscodeInput.style.borderColor = 'var(--input-border)';
        setTimeout(() => adminPasscodeInput.focus(), 100);
      }
      if (adminPasscodeError) adminPasscodeError.style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (portal === 'user') {
      if (gatewayView) gatewayView.style.display = 'none';
      if (adminPasscodeView) adminPasscodeView.style.display = 'none';
      if (adminPortalView) adminPortalView.style.display = 'none';
      if (userPortalView) userPortalView.style.display = 'block';
      if (navPortalLinks) navPortalLinks.style.display = 'flex';
      if (navSignOutBtn) navSignOutBtn.style.display = 'inline-flex';
      if (tabUser) { tabUser.style.display = 'inline-block'; tabUser.classList.add('active'); }
      if (tabAdmin) { tabAdmin.style.display = 'none'; } // Hide Admin from regular users
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Gateway login screen
      if (gatewayView) gatewayView.style.display = 'block';
      if (adminPasscodeView) adminPasscodeView.style.display = 'none';
      if (userPortalView) userPortalView.style.display = 'none';
      if (adminPortalView) adminPortalView.style.display = 'none';
      if (navPortalLinks) navPortalLinks.style.display = 'none';
      if (navSignOutBtn) navSignOutBtn.style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (window.webglApp) {
      setTimeout(() => { window.webglApp.updatePositions(); }, 60);
    }
  }

  // 1. Gateway Admin Button -> Opens Dedicated Passcode Page
  if (gatewayEnterAdminBtn) {
    gatewayEnterAdminBtn.addEventListener('click', () => {
      openPortal('admin-passcode');
    });
  }

  // 2. Passcode Verification (2007) with iPhone FaceID Verified Tick
  function handlePasscodeVerification() {
    const code = adminPasscodeInput ? adminPasscodeInput.value.trim() : '';
    if (code === '2007') {
      if (adminPasscodeError) adminPasscodeError.style.display = 'none';
      if (adminPasscodeInput) adminPasscodeInput.blur();
      
      // Trigger FaceID-Style Verified Tick Animation
      if (passcodeForm) passcodeForm.style.display = 'none';
      if (passcodeVerified) passcodeVerified.style.display = 'block';

      // After satisfaction delay, enter admin portal
      setTimeout(() => {
        openPortal('admin');
      }, 750);
    } else {
      if (adminPasscodeError) {
        adminPasscodeError.style.display = 'block';
        adminPasscodeError.innerText = "❌ Invalid Passcode. Access Denied.";
      }
      if (adminPasscodeInput) {
        adminPasscodeInput.classList.remove('shake-input');
        void adminPasscodeInput.offsetWidth; // Trigger reflow for animation restart
        adminPasscodeInput.classList.add('shake-input');
        adminPasscodeInput.style.borderColor = "#EF4444";
        adminPasscodeInput.focus();
      }
    }
  }

  if (adminPasscodeVerifyBtn) {
    adminPasscodeVerifyBtn.addEventListener('click', handlePasscodeVerification);
  }

  if (adminPasscodeInput) {
    adminPasscodeInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        handlePasscodeVerification();
      }
    });
  }

  if (gatewayAdminDocsBtn) {
    gatewayAdminDocsBtn.addEventListener('click', () => {
      const modal = document.getElementById('instructions-modal');
      if (modal) modal.style.display = 'flex';
    });
  }

  if (tabUser) tabUser.addEventListener('click', () => openPortal('user'));
  if (tabAdmin) tabAdmin.addEventListener('click', () => openPortal('admin-passcode'));
  if (navSignOutBtn) navSignOutBtn.addEventListener('click', () => openPortal('gateway'));
  if (navHomeBtn) navHomeBtn.addEventListener('click', () => openPortal('gateway'));
  exitPortalBtns.forEach(btn => btn.addEventListener('click', () => openPortal('gateway')));

  // Check URL params for initial portal state or OAuth callbacks
  const urlParams = new URLSearchParams(window.location.search);
  const initialPortal = urlParams.get('portal');
  if (initialPortal === 'admin') {
    openPortal('admin-passcode');
  } else if (initialPortal === 'user' || urlParams.get('auth')) {
    openPortal('user');
  } else {
    openPortal('gateway'); // Default to Gateway login screen
  }

  // 1-Click OAuth Connect Links
  const gatewayGoogleBtn = document.getElementById('gateway-google-btn');
  if (gatewayGoogleBtn) {
    gatewayGoogleBtn.href = `${API_BASE}/api/auth/google?portal=user`;
  }
  const userGoogleConnectBtn = document.getElementById('user-google-connect-btn');
  if (userGoogleConnectBtn) {
    userGoogleConnectBtn.href = `${API_BASE}/api/auth/google?portal=user`;
  }

  // 3. User Portal: State & Form Elements
  const userConnectedEmail = document.getElementById('user-connected-email');
  const userAuthBadge = document.getElementById('user-auth-badge');
  const userSubjectLine = document.getElementById('user-subject-line');
  const userCustomText = document.getElementById('user-custom-text');
  const userSaveBtn = document.getElementById('user-save-config-btn');
  const userSaveStatus = document.getElementById('user-save-status');

  const userActiveCardImg = document.getElementById('user-active-card-img');
  const userPreviewCard = document.getElementById('user-preview-card');
  const userPreviewText = document.getElementById('user-preview-text');

  const userCardForm = document.getElementById('user-card-upload-form');
  const userCardFile = document.getElementById('user-card-file');
  const userCardBtn = document.getElementById('user-card-upload-btn');
  const userCardStatus = document.getElementById('user-card-status');

  const userSendTestBtn = document.getElementById('user-send-test-btn');
  const userTestEmailInput = document.getElementById('user-test-email');
  const userTestStatus = document.getElementById('user-test-status');

  // 4. Admin Portal: State & Form Elements
  const botToggle = document.getElementById('bot-active-toggle');
  const botPrimaryEmail = document.getElementById('bot-primary-email');
  const botSubjectLine = document.getElementById('bot-subject-line');
  const botText = document.getElementById('bot-custom-text');
  const botFilterMode = document.getElementById('bot-filter-mode');
  const saveBtn = document.getElementById('save-config-btn');
  const saveStatus = document.getElementById('save-status');

  const activeCardImg = document.getElementById('active-card-img');
  const activeCardFilename = document.getElementById('active-card-filename');
  const statusText = document.getElementById('engine-status-text');
  const processedCountText = document.getElementById('engine-processed-count');
  const activeCardStatusText = document.getElementById('engine-active-card');
  const lastCheckText = document.getElementById('engine-last-check');

  // Live typing preview sync
  if (userCustomText && userPreviewText) {
    userCustomText.addEventListener('input', () => {
      userPreviewText.innerText = userCustomText.value || 'How can I help you today? Please leave your message and wait for a reply within 5 minutes.';
    });
  }

  // Load configuration from backend
  fetch(`${API_BASE}/api/config`)
    .then(res => res.json())
    .then(data => {
        const primary = data.primaryEmail || 'koushalcharn22@gmail.com';
        if (userConnectedEmail) userConnectedEmail.innerText = primary;
        if (userTestEmailInput) userTestEmailInput.value = primary;
        if (botPrimaryEmail) botPrimaryEmail.value = primary;

        const subject = data.subjectLine || 'Re: Quick Response & Follow-up';
        if (userSubjectLine) userSubjectLine.value = subject;
        if (botSubjectLine) botSubjectLine.value = subject;

        const text = data.customText || 'How can I help you today? Please leave your message and wait for a reply within 5 minutes.';
        if (userCustomText) userCustomText.value = text;
        if (userPreviewText) userPreviewText.innerText = text;
        if (botText) botText.value = text;

        if (botToggle) botToggle.checked = !!data.active;
        if (botFilterMode) botFilterMode.value = data.filterMode || 'personal';

        if (data.cardFile) {
            const cardUrl = `${API_BASE}/public/${data.cardFile}?t=${Date.now()}`;
            if (userActiveCardImg) userActiveCardImg.src = cardUrl;
            if (userPreviewCard) userPreviewCard.src = cardUrl;
            if (activeCardImg) activeCardImg.src = cardUrl;
            if (activeCardFilename) activeCardFilename.innerText = `Active: ${data.cardFile}`;
            if (activeCardStatusText) activeCardStatusText.innerText = data.cardFile;
        }
    }).catch(e => console.log("Backend offline or initializing...", e));

  // User Portal: Save Configuration
  if (userSaveBtn) {
    userSaveBtn.addEventListener('click', () => {
       const payload = {
          subjectLine: userSubjectLine ? userSubjectLine.value : 'Re: Quick Response',
          customText: userCustomText ? userCustomText.value : ''
       };
       userSaveBtn.innerText = "Saving...";
       fetch(`${API_BASE}/api/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
       }).then(res => res.json())
         .then(data => {
            userSaveBtn.innerText = "Save Message Settings";
            if (userSaveStatus) {
                userSaveStatus.style.display = 'block';
                setTimeout(() => { userSaveStatus.style.display = 'none'; }, 3000);
            }
         }).catch(e => {
            userSaveBtn.innerText = "Error (See Console)";
         });
    });
  }

  // Admin Portal: Save Configuration
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
       const payload = {
          active: botToggle ? botToggle.checked : true,
          primaryEmail: botPrimaryEmail ? botPrimaryEmail.value : 'koushalcharn22@gmail.com',
          subjectLine: botSubjectLine ? botSubjectLine.value : 'Re: Quick Response',
          customText: botText ? botText.value : '',
          filterMode: botFilterMode ? botFilterMode.value : 'personal'
       };
       saveBtn.innerText = "Deploying...";
       fetch(`${API_BASE}/api/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
       }).then(res => res.json())
         .then(data => {
            saveBtn.innerText = "Save Global Config";
            if (saveStatus) {
                saveStatus.style.display = 'block';
                setTimeout(() => { saveStatus.style.display = 'none'; }, 3000);
            }
         }).catch(e => {
            saveBtn.innerText = "Error (See Console)";
         });
    });
  }

  // User Portal: Business Card Uploader
  if (userCardForm) {
    userCardForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!userCardFile.files || userCardFile.files.length === 0) return;

      const formData = new FormData();
      formData.append('businessCard', userCardFile.files[0]);

      if (userCardBtn) userCardBtn.innerText = "Uploading Card...";
      if (userCardStatus) {
        userCardStatus.innerText = "Uploading & Processing...";
        userCardStatus.style.color = "var(--text-80)";
        userCardStatus.style.display = 'block';
      }

      fetch(`${API_BASE}/api/upload-card`, {
        method: 'POST',
        body: formData
      })
      .then(res => res.json())
      .then(data => {
        if (userCardBtn) userCardBtn.innerText = "Upload My Card";
        if (data.success) {
          if (userCardStatus) {
            userCardStatus.innerText = "✅ Business Card updated successfully!";
            userCardStatus.style.color = "#10B981";
          }
          const updatedCardUrl = `${API_BASE}/public/${data.cardFile}?t=${Date.now()}`;
          if (userActiveCardImg) userActiveCardImg.src = updatedCardUrl;
          if (userPreviewCard) userPreviewCard.src = updatedCardUrl;
          if (activeCardImg) activeCardImg.src = updatedCardUrl;
        }
      })
      .catch(err => {
        if (userCardBtn) userCardBtn.innerText = "Upload My Card";
        if (userCardStatus) {
          userCardStatus.innerText = "Network error uploading card.";
          userCardStatus.style.color = "#EF4444";
        }
      });
    });
  }

  // Admin Portal: Business Card Uploader
  const cardUploadForm = document.getElementById('card-upload-form');
  const cardUploadStatus = document.getElementById('card-upload-status');
  const uploadCardBtn = document.getElementById('upload-card-btn');
  if (cardUploadForm) {
    cardUploadForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('business-card-file');
      if (!fileInput.files || fileInput.files.length === 0) return;

      const formData = new FormData();
      formData.append('businessCard', fileInput.files[0]);

      if (uploadCardBtn) uploadCardBtn.innerText = "Uploading...";
      fetch(`${API_BASE}/api/upload-card`, { method: 'POST', body: formData })
      .then(res => res.json())
      .then(data => {
        if (uploadCardBtn) uploadCardBtn.innerText = "Upload Card";
        if (data.success) {
          if (cardUploadStatus) {
            cardUploadStatus.innerText = "✅ Saved!";
            cardUploadStatus.style.color = "#10B981";
            cardUploadStatus.style.display = 'block';
          }
          const updatedCardUrl = `${API_BASE}/public/${data.cardFile}?t=${Date.now()}`;
          if (activeCardImg) activeCardImg.src = updatedCardUrl;
          if (userActiveCardImg) userActiveCardImg.src = updatedCardUrl;
          if (userPreviewCard) userPreviewCard.src = updatedCardUrl;
        }
      });
    });
  }

  // User Portal: Live Test Email Sender
  if (userSendTestBtn) {
    userSendTestBtn.addEventListener('click', () => {
      const recipient = userTestEmailInput ? userTestEmailInput.value.trim() : 'koushalcharn22@gmail.com';
      userSendTestBtn.innerText = "🚀 Sending...";
      userSendTestBtn.disabled = true;
      if (userTestStatus) {
        userTestStatus.innerText = `Dispatching test email to ${recipient}...`;
        userTestStatus.style.color = "var(--text-80)";
        userTestStatus.style.display = 'block';
      }

      fetch(`${API_BASE}/api/send-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: recipient })
      })
      .then(res => res.json())
      .then(data => {
        userSendTestBtn.innerText = "🚀 Send Test Email";
        userSendTestBtn.disabled = false;
        if (data.success) {
          if (userTestStatus) {
            userTestStatus.innerText = `✅ ${data.message}`;
            userTestStatus.style.color = "#10B981";
          }
        } else {
          if (userTestStatus) {
            userTestStatus.innerText = `❌ Error: ${data.error || "Failed"}`;
            userTestStatus.style.color = "#EF4444";
          }
        }
      })
      .catch(err => {
        userSendTestBtn.innerText = "🚀 Send Test Email";
        userSendTestBtn.disabled = false;
        if (userTestStatus) {
          userTestStatus.innerText = "❌ Network error sending test email.";
          userTestStatus.style.color = "#EF4444";
        }
      });
    });
  }

  // Admin Portal: Credentials Upload Form
  const uploadForm = document.getElementById('credentials-upload-form');
  const uploadStatus = document.getElementById('upload-status');
  if (uploadForm) {
      uploadForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const formData = new FormData(uploadForm);
          const files = document.getElementById('credentials-file').files;
          if (files.length === 0) return;
          
          if (uploadStatus) {
            uploadStatus.innerText = "Uploading Credentials Vault...";
            uploadStatus.style.color = "var(--text-100)";
            uploadStatus.style.display = 'block';
          }
          
          fetch(`${API_BASE}/api/upload-credentials`, {
              method: 'POST',
              body: formData
          })
          .then(res => res.json())
          .then(data => {
              if (data.success) {
                  if (uploadStatus) {
                    uploadStatus.innerText = "✅ " + data.message;
                    uploadStatus.style.color = "#10B981";
                  }
              } else {
                  if (uploadStatus) {
                    uploadStatus.innerText = "Error: " + data.error;
                    uploadStatus.style.color = "#EF4444";
                  }
              }
          });
      });
  }

  // Telemetry Polling Loop
  setInterval(() => {
      fetch(`${API_BASE}/api/status`)
      .then(res => res.json())
      .then(data => {
          if (statusText) {
              if (data.isRunning) {
                  statusText.innerText = "Online";
                  statusText.style.color = "#10B981";
                  statusText.style.background = "rgba(16, 185, 129, 0.1)";
                  if (userAuthBadge) {
                    userAuthBadge.innerText = "Connected";
                    userAuthBadge.style.color = "#10B981";
                    userAuthBadge.style.background = "rgba(16, 185, 129, 0.1)";
                  }
              } else {
                  statusText.innerText = "Offline: " + (data.error || "Paused");
                  statusText.style.color = "#EF4444";
                  statusText.style.background = "rgba(239, 68, 68, 0.1)";
                  if (userAuthBadge) {
                    userAuthBadge.innerText = "Disconnected";
                    userAuthBadge.style.color = "#EF4444";
                    userAuthBadge.style.background = "rgba(239, 68, 68, 0.1)";
                  }
              }
          }
          if (processedCountText && data.messagesProcessed !== undefined) {
              processedCountText.innerText = data.messagesProcessed;
          }
          if (activeCardStatusText && data.activeCard) {
              activeCardStatusText.innerText = data.activeCard;
          }
          if (lastCheckText && data.lastChecked) {
              lastCheckText.innerText = "Last heartbeat: " + new Date(data.lastChecked).toLocaleTimeString();
          }
      }).catch(() => {});
  }, 4000);

  // Instructions Modal
  const instrBtn = document.getElementById('show-instructions-btn');
  const instrModal = document.getElementById('instructions-modal');
  const closeBtn = document.getElementById('close-modal-btn');
  if (instrBtn && instrModal && closeBtn) {
      instrBtn.addEventListener('click', () => instrModal.style.display = 'flex');
      closeBtn.addEventListener('click', () => instrModal.style.display = 'none');
  }
});


