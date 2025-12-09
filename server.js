const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY_JEUX);
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
  const listeNoms = Object.values(joueur);
  const nomsString = JSON.stringify(listeNoms);

  console.log(
    `🤖 L'IA génère ${nb} questions pour ${nbJoueursReels} joueurs. Thème: "${theme}"`
  );

  const prompt = `
    Tu es un animateur de jeu de soirée "Balance ton pote". Ton but est de créer des débats drôles et piquants.
    Génère une liste de ${nb} questions en JSON.

    INFORMATIONS :
    - Thème : "${theme}"
    - Joueurs disponibles : ${nomsString}

    --- 
    MODE 1 : LE DUEL (Environ 30% des questions)
    Concept : Tu opposes DEUX joueurs spécifiques.
    Règles :
    1. Dans le champ "choix", mets UNIQUEMENT 2 prénoms tirés de la liste.
    2. La question DOIT commencer par "Entre [Nom A] et [Nom B]..." ou "Si [Nom A] et [Nom B] se battaient...".
    3. Exemple : "Entre Julie et Thomas, qui pleure devant un Disney ?" (Et tu mets Julie et Thomas dans les choix).

    ---
    MODE 2 : LE GROUPE (Les questions restantes)
    Concept : Tout le monde peut être voté.
    Règles :
    1. La question commence par "Qui...", "Lequel de nous...", "Qui est le plus...".
    2. NE JAMAIS citer un prénom dans la question (sauf si tu utilises la balise {JOUEUR}).
    3. Remplis les choix avec 4 noms au hasard (ou tous les noms si < 4 joueurs).
    
    ---
    STYLE D'ÉCRITURE (TRES IMPORTANT) :
    - Sois direct et court (Max 15 mots).
    - Pas de phrases compliquées. On veut du tac-au-tac.
    - INTERDIT : Ne réponds pas à la question dans la question (ex: "Pourquoi Théo est bête ?" -> NON).
    - INTERDIT : Ne fais pas de questions à rallonge avec des "Si... alors...".
    - AUTORISÉ : Tu peux utiliser "{JOUEUR}" pour insérer un prénom aléatoire dans une question de groupe (ex: "Qui volerait l'argent de {JOUEUR} ?").

    FORMAT DE SORTIE ATTENDU (JSON pur) :
>>>>>>> Stashed changes
    [
      {
        "texte": "Entre Manon et Léo, qui survit le plus longtemps aux zombies ?",
        "choix": ["Manon", "Léo"]
      },
      {
        "texte": "Qui a l'historique Internet le plus honteux ?",
        "choix": ["Manon", "Léo", "Paul", "Julie"]
      },
      {
        "texte": "Qui serait capable de vendre {JOUEUR} pour un kebab ?",
        "choix": ["Manon", "Léo", "Paul", "Julie"]
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

    return JSON.parse(text);
  } catch (error) {
    console.error("⚠️ Erreur IA :", error.message);
    return [
      {
        texte: "L'IA a buggé... Qui a la pire connexion ici ?",
        choix: listeNoms, 
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
      
      let classement = [];
      
      Object.keys(joueurs).forEach((id) => {
        const aVotePourLeGagnant = (votes[id] === indexGagnant);
        
        if (aVotePourLeGagnant) {
            scores[id] += 1;
        }

        classement.push({ 
            nom: joueurs[id], 
            points: scores[id] || 0,
            gain: aVotePourLeGagnant ? 1 : 0 
        });
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
