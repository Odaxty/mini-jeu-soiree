const socket = io();

// --- ELEMENTS HTML (C'est ici que ça plantait si l'HTML n'était pas bon) ---
const ecranLogin = document.getElementById('login-screen');
const ecranLobby = document.getElementById('lobby-screen');
const ecranGame = document.getElementById('game-screen');

const listeJoueursUI = document.getElementById('players-list');
const btnjoin = document.getElementById('btn-join');
const inputname = document.getElementById('username');
const btnStart = document.getElementById('btn-start');

// Zones ADMIN
const adminControls = document.getElementById('admin-controls');
const waitingMessage = document.getElementById('waiting-message');

// Zones JEU
const questionTexteUI = document.getElementById('question-text');
const choixContainerUI = document.getElementById('choices-container');
const scoreboardUI = document.getElementById('scoreboard');
const scoreContainerUI = document.getElementById('score-container');

// POPUP
const popupUI = document.getElementById('custom-popup');
const popupMessageUI = document.getElementById('popup-message');
let popupTimer;

let chronoInterval; // Variable pour stocker le timer

function lancerChrono(dureeEnSecondes) {
    const barre = document.getElementById('timer-bar');
    let tempsRestant = dureeEnSecondes;
    const intervalTime = 100; // Mise à jour tous les 100ms pour être fluide
    const deernement = 0.1; // On retire 0.1s à chaque fois

    // Reset visuel immédiat
    clearInterval(chronoInterval);
    barre.style.width = "100%";
    barre.className = "bg-green-500 h-4 rounded-full transition-all duration-100 ease-linear";

    chronoInterval = setInterval(() => {
        tempsRestant -= deernement;
        
        // Calcul du pourcentage
        const pourcentage = (tempsRestant / dureeEnSecondes) * 100;
        barre.style.width = `${pourcentage}%`;

        // Changement de couleur dynamique
        // Si moins de 50% -> Orange
        // Si moins de 20% -> Rouge
        if (pourcentage < 20) {
            barre.classList.remove('bg-yellow-500', 'bg-green-500');
            barre.classList.add('bg-red-600');
        } else if (pourcentage < 50) {
            barre.classList.remove('bg-green-500', 'bg-red-600');
            barre.classList.add('bg-yellow-500');
        }

        // Fin du temps
        if (tempsRestant <= 0) {
            clearInterval(chronoInterval);
            barre.style.width = "0%";
        }
    }, intervalTime);
}

// --- FONCTIONS POPUP ---
function afficherPopup(message) {
    if(!popupMessageUI) return; // Sécurité anti-crash
    popupMessageUI.innerHTML = message;
    popupUI.classList.remove('hidden');
    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = setTimeout(() => cacherPopup(), 5000);
}

function cacherPopup() {
    if(!popupUI) return;
    popupUI.classList.add('hidden');
    if (popupTimer) clearTimeout(popupTimer);
}
if(popupUI) popupUI.addEventListener('click', () => cacherPopup());

// --- CONNEXION ---
if(btnjoin) {
    btnjoin.addEventListener('click', () => {
        const monPseudo = inputname.value;
        if (monPseudo.length > 0) {
            socket.emit('rejoindre', monPseudo); 
            ecranLogin.classList.add('hidden'); 
            ecranLobby.classList.remove('hidden'); 
        }
    });
}

// --- LOGIQUE SOCKET ---

socket.on('maj_liste_joueurs', (listeDesPseudos) => {
    if(!listeJoueursUI) return;
    listeJoueursUI.innerHTML = "";
    listeDesPseudos.forEach((pseudo) => {
        const li = document.createElement('li');
        li.textContent = pseudo;
        li.className = "bg-purple-700 p-2 rounded text-white shadow"; 
        listeJoueursUI.appendChild(li);
    });
});

socket.on('mise_a_jour_host', (idDuChef) => {
    // C'est souvent ici que tu avais l'erreur "classList of null"
    // car adminControls n'existait pas dans ton HTML
    if (socket.id === idDuChef) {
        if(adminControls) adminControls.classList.remove('hidden');
        if(waitingMessage) waitingMessage.classList.add('hidden');
    } else {
        if(adminControls) adminControls.classList.add('hidden');
        if(waitingMessage) waitingMessage.classList.remove('hidden');
    }
});

if(btnStart) {
    btnStart.addEventListener('click', () => {
        const inputTours = document.getElementById('nb-tours');
        const selectTheme = document.getElementById('theme-select'); 
        
        const nbTours = inputTours ? parseInt(inputTours.value) : 5;
        const theme = selectTheme ? selectTheme.value : "Aléatoire"; 

        btnStart.textContent = "Génération par l'IA... 🤖";
        btnStart.disabled = true;
        btnStart.classList.add('opacity-50');

        socket.emit('lancer_partie', { nbTours, theme });
    });
}

socket.on('message_erreur', (msg) => {
    afficherPopup("⛔ Erreur : " + msg);
});

socket.on('afficher_regles', (texteDesRegles) => {
    ecranLobby.classList.add('hidden');
    ecranGame.classList.remove('hidden');
    scoreContainerUI.classList.add('hidden');

    questionTexteUI.innerHTML = texteDesRegles;
    
    choixContainerUI.innerHTML = "<h3 class='text-white animate-pulse'>La partie commence dans 10 secondes...</h3>";
});

socket.on('nouvelle_question', (laQuestion) => {
    ecranLobby.classList.add('hidden');
    ecranGame.classList.remove('hidden');
    scoreContainerUI.classList.add('hidden'); 
    lancerChrono(laQuestion.temps);
    questionTexteUI.textContent = laQuestion.texte;
    choixContainerUI.innerHTML = ""; 
    
    laQuestion.choix.forEach((reponse, index) => {
        const btn = document.createElement('button');
        btn.textContent = reponse;
        btn.className = "bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-4 rounded shadow transition";
        
        btn.addEventListener('click', () => {
            socket.emit('envoyer_vote', index);
            const tousLesBoutons = choixContainerUI.querySelectorAll('button');
            tousLesBoutons.forEach(unBouton => {
                unBouton.disabled = true;
                if (unBouton === btn) {
                    unBouton.className = "bg-green-500 text-white font-bold py-4 px-4 rounded shadow border-4 border-white transform scale-105 transition"; 
                    unBouton.textContent = " : CHOISI ✅"; 
                } else {
                    unBouton.classList.add('opacity-25'); 
                    unBouton.classList.remove('hover:bg-blue-500'); 
                }
            }); 
            questionTexteUI.textContent = "Vote envoyé ! En attente des autres...";
        });
        choixContainerUI.appendChild(btn);
    });
});

socket.on('fin_manche', (infos) => {
    clearInterval(chronoInterval);
    if (infos.gagnant !== -1) {
       const boutons = choixContainerUI.querySelectorAll('button');
       if(boutons[infos.gagnant]) {
           const reponseGagnante = boutons[infos.gagnant].textContent;
           afficherPopup(`La majorité a voté : <br><span class="text-3xl text-yellow-500">${reponseGagnante}</span>`);
       }
    }

    scoreContainerUI.classList.remove('hidden');
    scoreboardUI.innerHTML = "";
    
    infos.classement.forEach(joueur => {
        const li = document.createElement('li');
        li.textContent = `${joueur.nom} : ${joueur.points} pts`;
        if (joueur.points > 0) li.classList.add('text-yellow-300', 'font-bold');
        else li.classList.add('text-gray-300');
        scoreboardUI.appendChild(li);
    });

    questionTexteUI.textContent = "Résultats du tour ! Préparez-vous...";
    choixContainerUI.innerHTML = ""; 
});

socket.on('retour_lobby', () => {
    afficherPopup("Partie terminée !<br>Retour au menu principal.");
    ecranGame.classList.add('hidden');
    scoreContainerUI.classList.add('hidden'); 
    ecranLobby.classList.remove('hidden');
    
    if(btnStart) {
        btnStart.textContent = "LANCER LA PARTIE !";
        btnStart.disabled = false;
        btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
    }
});