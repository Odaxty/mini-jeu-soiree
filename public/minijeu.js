console.log("Chargement du module Mini-Jeu (Popup + Couleurs)...");

const btnMiniStart = document.getElementById('btn-mini-start');
const miniGameBox = document.getElementById('mini-game-box');
const miniTarget = document.getElementById('mini-target');
const miniScoreUI = document.getElementById('mini-score');
const bestScoreUI = document.getElementById('best-score');

// Éléments du Popup Game Over
const miniGameOverUI = document.getElementById('mini-game-over');
const finalScoreUI = document.getElementById('final-score');

let miniScore = 0;
let bestScore = 0;
let jeuActif = false;
let gameLoopInterval; 
let tempsDebutTour;
let tempsTotalPourCeTour;

// --- FONCTION DEFAITE (Affiche le Popup) ---
function gameOver() {
    // 1. On coupe tout
    jeuActif = false; 
    if(gameLoopInterval) clearInterval(gameLoopInterval);

    // 2. On affiche le Popup
    if (miniGameOverUI) {
        // On met le score final dans le popup
        if(finalScoreUI) finalScoreUI.textContent = miniScore;
        // On affiche la div
        miniGameOverUI.classList.remove('hidden');
    }

    // 3. On remet le bouton principal en mode "JOUER"
    if(btnMiniStart) {
        btnMiniStart.textContent = "JOUER";
        btnMiniStart.classList.replace('bg-red-600', 'bg-blue-600');
    }
}

// --- FONCTION RELANCER ---
function restartGame() {
    // On cache le popup
    if(miniGameOverUI) miniGameOverUI.classList.add('hidden');
    
    // Reset scores et état
    miniScore = 0;
    if(miniScoreUI) miniScoreUI.textContent = "0";
    jeuActif = true;
    
    // C'est parti !
    bougerCible();
}

function bougerCible() {
    if (!jeuActif) return;
    if(gameLoopInterval) clearInterval(gameLoopInterval);

    // --- CALCUL DIFFICULTÉ ---
    tempsTotalPourCeTour = Math.max(500, 2000 - (miniScore * 50));
    tempsDebutTour = Date.now();

    // --- TAILLE ---
    let tailleBase = 48; 
    let tailleActuelle = Math.max(20, tailleBase - miniScore); 

    // --- POSITION ---
    const boxRect = miniGameBox.getBoundingClientRect();
    const maxX = boxRect.width - tailleActuelle;
    const maxY = boxRect.height - tailleActuelle;

    if (maxX > 0 && maxY > 0) {
        const randomX = Math.floor(Math.random() * maxX);
        const randomY = Math.floor(Math.random() * maxY);
        miniTarget.style.left = randomX + 'px';
        miniTarget.style.top = randomY + 'px';
    }
    
    miniTarget.style.width = tailleActuelle + 'px';
    miniTarget.style.height = tailleActuelle + 'px';

    // --- COULEUR DE DÉPART (Jaune) ---
    miniTarget.className = `absolute rounded-full shadow-lg active:scale-90 transition-colors duration-200 bg-yellow-400`;

    // --- BOUCLE DE SURVEILLANCE TEMPS (Pour les couleurs) ---
    gameLoopInterval = setInterval(() => {
        if(!jeuActif) return;

        const tempsEcoule = Date.now() - tempsDebutTour;
        const tempsRestant = tempsTotalPourCeTour - tempsEcoule;

        // 1. TEMPS ÉCOULÉ -> PERDU
        if (tempsRestant <= 0) {
            clearInterval(gameLoopInterval);
            gameOver();
        } 
        // 2. RESTE 0.5s -> ROUGE
        else if (tempsRestant <= 500) {
            miniTarget.classList.remove('bg-yellow-400', 'bg-orange-500');
            miniTarget.classList.add('bg-red-600');
        }
        // 3. RESTE 1.5s -> ORANGE
        else if (tempsRestant <= 1500) {
            miniTarget.classList.remove('bg-yellow-400');
            miniTarget.classList.add('bg-orange-500');
        }
        
    }, 50); 
}

// --- ÉVÉNEMENTS ---

// Bouton JOUER / ARRÊTER du menu
if(btnMiniStart) {
    btnMiniStart.addEventListener('click', () => {
        if (!jeuActif) {
            // START
            // On cache le popup s'il était là
            if(miniGameOverUI) miniGameOverUI.classList.add('hidden');
            
            btnMiniStart.textContent = "ARRÊTER";
            btnMiniStart.classList.replace('bg-blue-600', 'bg-red-600');
            miniGameBox.classList.remove('hidden');
            
            // Petit délai pour que l'affichage se fasse avant le calcul
            setTimeout(() => restartGame(), 50);
        } else {
            // STOP
            jeuActif = false;
            if(gameLoopInterval) clearInterval(gameLoopInterval);
            btnMiniStart.textContent = "JOUER";
            btnMiniStart.classList.replace('bg-red-600', 'bg-blue-600');
            miniGameBox.classList.add('hidden');
        }
    });
}

// Clic sur la cible
if(miniTarget) {
    miniTarget.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!jeuActif) return; 
        
        miniScore++;
        if(miniScoreUI) miniScoreUI.textContent = miniScore;

        if (miniScore > bestScore) {
            bestScore = miniScore;
            if(bestScoreUI) bestScoreUI.textContent = bestScore;
        }
        
        bougerCible();
    });
}

// Clic sur le Popup Game Over pour rejouer
if(miniGameOverUI) {
    miniGameOverUI.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // On remet le bouton en mode "Arrêter" (car on joue)
        if(btnMiniStart) {
            btnMiniStart.textContent = "ARRÊTER";
            btnMiniStart.classList.replace('bg-blue-600', 'bg-red-600');
        }
        restartGame();
    });
}