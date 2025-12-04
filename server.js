const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
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
let reglesDejaAffichees = false;

app.use(express.static(path.join(__dirname, "public")));

async function genererQuestionsIA(nb, theme, nbJoueursReels, joueur) {
  // On s'assure d'avoir un tableau de noms propre (ex: ['Théo', 'Manon', 'Julie'])
  const listeNoms = Object.values(joueur);
  const nomsString = JSON.stringify(listeNoms);

  console.log(
    `🤖 L'IA génère ${nb} questions pour ${nbJoueursReels} joueurs (${theme})...`
  );

  const prompt = `
    Tu es un animateur de jeu de soirée. Génère une liste de ${nb} questions pour un groupe d'amis.
    
    INFORMATIONS DE LA PARTIE :
    - Thème : "${theme}"
    - Nombre de joueurs : ${nbJoueursReels}
    - Liste des prénoms des joueurs : ${nomsString}

    RÈGLES STRICTES :
    1. **Phrasé** : Utilise des tournures comme "Qui parmi nous...", "Qui est le plus...", "Lequel de nous...".
    2. **Longueur** : Maximum 15 mots par question (court et percutant).
    3. **Interdit** : N'utilise jamais "Qui de nous deux".
    4. **Placeholder** : Une fois sur trois, intègre la balise "{JOUEUR}" dans le texte de la question pour cibler quelqu'un (ex: "Qui volerait la voiture de {JOUEUR} ?").
    5. **Les Choix (IMPORTANT)** : 
       - Le champ "choix" doit être un tableau de chaînes de caractères.
       - Tu dois piocher les noms UNIQUEMENT dans la liste fournie : ${nomsString}.
       - Si le groupe a plus de 4 joueurs, sélectionne 4 noms au hasard pour les choix.
       - Si le groupe a 4 joueurs ou moins, mets tous les noms dans les choix.

    FORMAT DE SORTIE (JSON uniquement, sans markdown) :
    [
      {
        "texte": "Qui finirait en prison le premier ?",
        "choix": ["Théo", "Manon", "Paul", "Léa"]
      },
      {
        "texte": "Qui est secrètement amoureux de {JOUEUR} ?",
        "choix": ["Manon", "Paul", "Théo", "Léa"]
      }
    ]
    `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const questionsGenerees = JSON.parse(text);
    return questionsGenerees;
  } catch (error) {
    console.error("⚠️ Erreur IA :", error.message);
    return [
      {
        texte: "L'IA a buggé, mais on continue ! Qui paye sa tournée ?",
        choix: ["C'est moi", "Jamais", "Si je perds", "Le chef"],
      },
    ];
  }
}

function getRandomPlayer(listeJoueurs) {
  const ids = Object.keys(listeJoueurs);
  const randomId = ids[Math.floor(Math.random() * ids.length)];
  return listeJoueurs[randomId];
}

function calculerResultats() {
  let comptes = { 0: 0, 1: 0, 2: 0, 3: 0 };
  Object.values(votes).forEach((choix) => comptes[choix]++);
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
    maQuestion = {
      texte: "Fin des questions !",
      choix: ["Ok", "Ok", "Ok", "Ok"],
    };
  }

  const victime = getRandomPlayer(joueurs);

  const questionEnvoi = {
    texte: maQuestion.texte.replace("{JOUEUR}", victime),
    choix: maQuestion.choix,
    temps: 15,
  };

  io.emit("nouvelle_question", questionEnvoi);
}

io.on("connection", (socket) => {
  socket.on("rejoindre", (name) => {
    socket.data.pseudo = name;
    joueurs[socket.id] = name;

    if (Object.keys(joueurs).length === 1) {
      hostId = socket.id;
    }

    io.emit("maj_liste_joueurs", Object.values(joueurs));
    io.emit("mise_a_jour_host", hostId);
  });

  socket.on("disconnect", () => {
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

    io.emit("maj_liste_joueurs", Object.values(joueurs));
    io.emit("mise_a_jour_host", hostId);
  });

  socket.on("lancer_partie", async (data) => {
    if (socket.id !== hostId) return;
    let tempsLectureMinimum = 0;
    if (!reglesDejaAffichees) {
      const regles = `
        <div class="flex flex-col gap-4 text-left text-base md:text-xl font-normal">
            <h2 class="text-3xl font-extrabold text-center text-yellow-400 mb-2 tracking-wider">
                📜 RÈGLES DU JEU
            </h2>
            
            <div class="bg-purple-800/80 p-4 rounded-xl border-l-4 border-blue-400 shadow-lg flex items-center gap-4 transition-transform hover:scale-105">
                <span class="text-4xl">🗳️</span>
                <div>
                    <span class="font-bold text-blue-300">VOTEZ</span> pour le joueur qui correspond le mieux à la question.
                </div>
            </div>

            <div class="bg-purple-800/80 p-4 rounded-xl border-l-4 border-green-400 shadow-lg flex items-center gap-4 transition-transform hover:scale-105">
                <span class="text-4xl">⚖️</span>
                <div>
                    La <span class="font-bold text-green-300">MAJORITÉ</span> l'emporte toujours.
                </div>
            </div>

            <div class="bg-purple-800/80 p-4 rounded-xl border-l-4 border-yellow-400 shadow-lg flex items-center gap-4 transition-transform hover:scale-105">
                <span class="text-4xl">💎</span>
                <div>
                    Ceux qui votent comme la majorité gagnent <span class="font-bold text-yellow-300">+1 POINT</span>.
                </div>
            </div>

            <div class="bg-purple-800/80 p-4 rounded-xl border-l-4 border-red-500 shadow-lg flex items-center gap-4 transition-transform hover:scale-105">
                <span class="text-4xl">🍺</span>
                <div>
                    Attention : Des <span class="font-bold text-red-400">GAGES</span> peuvent tomber !
                </div>
            </div>
        </div>
    `;
    io.emit("afficher_regles", regles);
    tempsLectureMinimum = 15000;
    reglesDejaAffichees = true;
    }

    const debutChargement = Date.now();
    console.log("Génération en cours pendant la lecture des règles...");
    const nbTours = data.nbTours;
    const theme = data.theme;
    const joueurDeLaPartie = joueurs;
    const nbJoueur = Object.keys(joueurs).length;
    questionsDuJeu = await genererQuestionsIA(
      nbTours,
      theme,
      nbJoueur,
      joueurDeLaPartie
    );

    toursRestants = nbTours;
    scores = {};
    Object.keys(joueurs).forEach((id) => (scores[id] = 0));

    const tempsEcoule = Date.now() - debutChargement;

    if (tempsEcoule < tempsLectureMinimum) {
        const tempsAttenteRestant = tempsLectureMinimum - tempsEcoule;
        console.log(`IA prête ! Attente de ${tempsAttenteRestant}ms pour la lecture.`);
        setTimeout(() => {
            envoyerUneQuestion();
        }, tempsAttenteRestant);
    } else {

        console.log("IA prête ! Lancement immédiat 🚀");
        envoyerUneQuestion();
    }
  });

  socket.on("envoyer_vote", (indexChoix) => {
    votes[socket.id] = indexChoix;
    const nbJoueursTotal = Object.keys(joueurs).length;
    const nbVotesActuels = Object.keys(votes).length;

    if (nbVotesActuels === nbJoueursTotal) {
      const indexGagnant = calculerResultats();
      Object.keys(votes).forEach((idJoueur) => {
        if (votes[idJoueur] === indexGagnant) scores[idJoueur] += 1;
      });

      let classement = [];
      Object.keys(joueurs).forEach((id) => {
        classement.push({ nom: joueurs[id], points: scores[id] || 0 });
      });
      classement.sort((a, b) => b.points - a.points);

      io.emit("fin_manche", { gagnant: indexGagnant, classement: classement });

      toursRestants--;

      setTimeout(() => {
        if (toursRestants > 0) {
          envoyerUneQuestion();
        } else {
          io.emit("retour_lobby");
        }
      }, 3000);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Le serveur tourne sur http://localhost:${PORT}`);
});
