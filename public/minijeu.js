console.log("Chargement du module Mini-Jeu Hardcore...");

const btnMiniStart = document.getElementById('btn-mini-start');
const miniGameBox = document.getElementById('mini-game-box');
const miniTarget = document.getElementById('mini-target');
const miniScoreUI = document.getElementById('mini-score');
const bestScoreUI = document.getElementById('best-score'); // Nouveau

let miniScore = 0;
let bestScore = 0;
let jeuActif = false;
let timerReflexe; // Variable pour stocker le compte à rebours

// --- FONCTION DE DEFAITE ---
function gameOver() {
    // Flash rouge pour dire "PERDU"
    miniGameBox.classList.add('bg-red-900');
    setTimeout(() => miniGameBox.classList.remove('bg-red-900'), 200);

    // On reset le score
    miniScore = 0;
    miniScoreUI.textContent = "0";
    
    // On relance la cible (mais avec la taille et vitesse de base)
    bougerCible();
}

function bougerCible() {
    if (!jeuActif) return;

    // 1. NETTOYAGE DU CHRONO PRÉCÉDENT
    if (timerReflexe) clearTimeout(timerReflexe);

    // 2. CALCUL DE LA DIFFICULTÉ PROGRESSIVE
    // Temps : On commence à 2sec, et on enlève 50ms par point (Minimum 0.5s)
    let tempsPourCliquer = Math.max(500, 2000 - (miniScore * 50));
    
    // Taille : On commence à 3rem (48px), on enlève un peu par point (Minimum 20px)
    let tailleBase = 48; 
    let tailleActuelle = Math.max(20, tailleBase - miniScore); 

    // 3. LANCEMENT DU CHRONO DE LA MORT
    timerReflexe = setTimeout(() => {
        gameOver(); // Si le temps est écoulé, c'est perdu !
    }, tempsPourCliquer);


    // --- POSITIONNEMENT (Comme avant) ---
    const boxRect = miniGameBox.getBoundingClientRect();
    const maxX = boxRect.width - tailleActuelle; // On adapte aux bords selon la taille
    const maxY = boxRect.height - tailleActuelle;

    const randomX = Math.floor(Math.random() * maxX);
    const randomY = Math.floor(Math.random() * maxY);

    miniTarget.style.left = randomX + 'px';
    miniTarget.style.top = randomY + 'px';
    
    // --- STYLE (Taille dynamique) ---
    // On applique la nouvelle taille (width et height)
    miniTarget.style.width = tailleActuelle + 'px';
    miniTarget.style.height = tailleActuelle + 'px';

    // Couleur aléatoire
    const couleurs = ['bg-yellow-400', 'bg-red-500', 'bg-green-400', 'bg-blue-400', 'bg-pink-500', 'bg-white'];
    const randomColor = couleurs[Math.floor(Math.random() * couleurs.length)];
    
    miniTarget.className = `absolute rounded-full shadow-lg active:scale-90 transition-all duration-75 ${randomColor}`;
}

// --- EVENTS ---

if(btnMiniStart) {
    btnMiniStart.addEventListener('click', () => {
        if (!jeuActif) {
            // START
            jeuActif = true;
            miniScore = 0;
            miniScoreUI.textContent = "0";
            
            btnMiniStart.textContent = "ARRÊTER";
            btnMiniStart.classList.replace('bg-blue-600', 'bg-red-600');
            miniGameBox.classList.remove('hidden');
            
            bougerCible(); 
        } else {
            // STOP
            jeuActif = false;
            if (timerReflexe) clearTimeout(timerReflexe); // On coupe le chrono
            btnMiniStart.textContent = "JOUER";
            btnMiniStart.classList.replace('bg-red-600', 'bg-blue-600');
            miniGameBox.classList.add('hidden');
        }
    });
}

if(miniTarget) {
    miniTarget.addEventListener('click', (e) => {
        e.stopPropagation();
        
        miniScore++;
        miniScoreUI.textContent = miniScore;

        // Gestion du Record
        if (miniScore > bestScore) {
            bestScore = miniScore;
            if(bestScoreUI) bestScoreUI.textContent = bestScore;
        }
        
        bougerCible();
    });
}