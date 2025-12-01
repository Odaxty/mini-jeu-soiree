const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

let joueurs = {};
let votes = {};
let toursRestants = 0;
let scores = {};
let questionsDuJeu = []; 
let hostId = null;

app.use(express.static(path.join(__dirname, 'public')));

async function genererQuestionsIA(nb, theme, nbJoueursReels) {
    console.log(`🤖 L'IA génère ${nb} questions pour ${nbJoueursReels} joueurs sur le thème : ${theme}...`);
    
    const prompt = `
    Génère une liste de ${nb} questions pour un jeu de soirée entre ${nbJoueursReels} amis.
    Thème : "${theme}".
    
    RÈGLES :
    1. La tournure de phrase doit être adaptée au groupe (ex: "Qui parmi nous...", "Qui dans ce groupe...", "Lequel d'entre nous...").
    2. N'utilise JAMAIS "Qui de nous deux" (car nous sommes ${nbJoueursReels}).
    3. Utilise la balise "{JOUEUR}" pour désigner une personne cible dans la question.
    4. Format JSON strict obligatoirement (balises "texte" et "choix").
    
    Exemple attendu :
    [
      {
        "texte": "Qui dans ce groupe est le plus susceptible de...",
        "choix": ["Réponse A", "Réponse B", "Réponse C", "Réponse D"]
      }
    ]
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        
        const questionsGenerees = JSON.parse(text);
        return questionsGenerees;
    } catch (error) {
        console.error("⚠️ Erreur IA :", error.message);
        return [{
            texte: "L'IA a buggé, mais on continue ! Qui paye sa tournée ?",
            choix: ["C'est moi", "Jamais", "Si je perds", "Le chef"]
        }];
    }
}

function getRandomPlayer(listeJoueurs) {
    const ids = Object.keys(listeJoueurs); 
    const randomId = ids[Math.floor(Math.random() * ids.length)];
    return listeJoueurs[randomId]; 
}

function calculerResultats() {
    let comptes = { 0: 0, 1: 0, 2: 0, 3: 0 };
    Object.values(votes).forEach(choix => comptes[choix]++);
    let maxVotes = 0;
    let indexGagnant = -1;
    for (let i = 0; i < 4; i++) {
        if (comptes[i] > maxVotes) {
            maxVotes = comptes[i];
            indexGagnant = i;
        }
    }
    return indexGagnant; 
}

function envoyerUneQuestion() {
    votes = {};

    let maQuestion = questionsDuJeu.shift(); 
    
    if (!maQuestion) {
        maQuestion = { texte: "Fin des questions !", choix: ["Ok", "Ok", "Ok", "Ok"] };
    }

    const victime = getRandomPlayer(joueurs);

    const questionEnvoi = {
        texte: maQuestion.texte.replace("{JOUEUR}", victime),
        choix: maQuestion.choix,
        temps: 15
    };

    io.emit('nouvelle_question', questionEnvoi);
}


io.on('connection', (socket) => {
    socket.on('rejoindre', (name) => {
        socket.data.pseudo = name;
        joueurs[socket.id] = name;
        
        if (Object.keys(joueurs).length === 1) {
            hostId = socket.id;
        }

        io.emit('maj_liste_joueurs', Object.values(joueurs));
        io.emit('mise_a_jour_host', hostId);
    });

    socket.on('disconnect', () => {
        console.log(`Déconnexion : ${socket.id}`);

        if (joueurs[socket.id]) {
            console.log(`Le joueur ${joueurs[socket.id]} nous quitte.`);
            delete joueurs[socket.id];
        }

        if (socket.id === hostId || !joueurs[hostId]) {
            console.log("Le chef est parti ! Recherche d'un nouveau chef...");
            
            const idsRestants = Object.keys(joueurs);
            
            if (idsRestants.length > 0) {
                hostId = idsRestants[0]; 
                console.log(`Nouveau chef désigné : ${joueurs[hostId]} (${hostId})`);
            } else {
                hostId = null;
                console.log("Plus aucun joueur. Partie vide.");
            }
        }

        io.emit('maj_liste_joueurs', Object.values(joueurs));
        io.emit('mise_a_jour_host', hostId);
    });


    socket.on('lancer_partie', async (data) => {
        if (socket.id !== hostId) {
            io.emit('message_erreur', "Seul l'hôte peut lancer la partie.");
            return; 
        }

        const nbTours = data.nbTours;
        const theme = data.theme;
        const nombreDeJoueursActuels = Object.keys(joueurs).length;
        console.log(`Demande de lancement : ${nbTours} tours, thème ${theme}`);
        
        questionsDuJeu = await genererQuestionsIA(nbTours, theme, nombreDeJoueursActuels);
        
        console.log("Questions reçues de l'IA ! Lancement du jeu.");

        toursRestants = nbTours;
        scores = {};
        Object.keys(joueurs).forEach(id => scores[id] = 0);
        
        envoyerUneQuestion(); 
    });

    socket.on('envoyer_vote', (indexChoix) => {
        votes[socket.id] = indexChoix;
        const nbJoueursTotal = Object.keys(joueurs).length;
        const nbVotesActuels = Object.keys(votes).length;

        if (nbVotesActuels === nbJoueursTotal) {
            const indexGagnant = calculerResultats();
            Object.keys(votes).forEach(idJoueur => {
                if (votes[idJoueur] === indexGagnant) scores[idJoueur] += 1; 
            });

            let classement = [];
            Object.keys(joueurs).forEach(id => {
                classement.push({ nom: joueurs[id], points: scores[id] || 0 });
            });
            classement.sort((a, b) => b.points - a.points);

            io.emit('fin_manche', { gagnant: indexGagnant, classement: classement });

            toursRestants--;

            setTimeout(() => {
                if (toursRestants > 0) {
                    envoyerUneQuestion();
                } else {
                    io.emit('retour_lobby');
                }
            }, 5000);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Le serveur tourne sur http://localhost:${PORT}`);
});