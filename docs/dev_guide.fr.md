# Guide du développeur pour StackIQ

Le but de ce guide est d'aider les développeurs à corriger des bugs ou ajouter des fonctionnalités à StackIQ.
Il contient un guide de l'architecture de l'application et oriente les développeurs vers les bons fichiers pour les modifications courantes.

## Table des matières

- [Technologies utilisées](#technologies-utilisées)
- [Prérequis](#prérequis)
- [Structure des fichiers](#structure-des-fichiers)
- [Architecture](#architecture)
- [Frontend](#frontend)
- [Backend](#backend)
- [Base de données](#base-de-données)
- [Workers](#workers)
- [Je veux modifier les métriques des issues](#je-veux-modifier-les-métriques-des-issues)
- [Je veux modifier le calcul du score](#je-veux-modifier-le-calcul-du-score)
- [Je veux ajouter une API](#je-veux-ajouter-une-api)

## Technologies utilisées

- React
- Vite
- Node.js
- Express
- TypeScript
- Node.js
- BullMQ
- PostgreSQL
- Prisma
- Redis
- Docker
- GitHub GraphQL API

## Prérequis

- Docker Desktop, en cours d'exécution.
- Node.js installé.
- Un fichier `.env` local copié depuis `.env.example`.
- Un `GITHUB_API_TOKEN` si vous voulez que les fonctionnalités dépendant de GitHub (scoring, issue mining, relations) fonctionnent. Cela peut être une liste de tokens séparés par des virgules ; le worker fait une rotation entre eux quand l'un d'eux approche sa limite de taux.
> Voir le README pour un guide de démarrage lors d'une première utilisation

## Structure des fichiers

```
.
├── backend/                            API Express, schéma Prisma et migrations (source de vérité pour la DB)
│   ├── src/
│   │   ├── api/route/                  Routes HTTP (analyses, leaderboards, queue)
│   │   ├── queue/                      Producteur de queue BullMQ
│   │   ├── db/                         Client Prisma
│   │   ├── redis/                      Client Redis
│   │   └── services/                   Services de lecture/cache du leaderboard
│   └── prisma/                         schema.prisma + migrations
│
├── worker/                             Consommateur BullMQ, scoring, mining
│   └── src/
│       ├── index.ts                    point d'entrée du worker (traitement des jobs et/ou scheduler)
│       ├── analysisProcessor.ts        pipeline exécuté par job
│       ├── dependencyScore.ts          logique de scoring
│       ├── dependencyRelationships.ts  détection des relations entre dépendances
│       ├── adapters/                   wrappers autour du GitHub miner et de l'issue mining
│       ├── issuesMining/               scripts JS simples qui interrogent et résument les issues GitHub
│       ├── gitHubMiner/                requêtes GitHub GraphQL + npm registry
│       ├── cache/                      cache d'analyse des dépendances (verrou Redis + cache DB)
│       └── reporting/                  génère le PDF envoyé par email
│
├── frontend/                           Application React
│   └── src/
│       ├── pages/                      pages au niveau des routes
│       ├── router/                     table des routes
│       ├── service/                    ApiService.tsx, tous les appels au backend
│       └── reporting/                  génération de rapport côté client
│
├── scripts/                            Scripts PowerShell start/stop/reset
├── tests/                              test end-to-end à la racine
├── .env                                variables d'environnement
├── tests/                              test end-to-end à la racine
└── docker-compose.yml
```

## Architecture

1. Un utilisateur soumet un `package.json` (envoi de fichier) au backend, via `POST /analyses`.
2. Le backend parse `dependencies` et `devDependencies`, crée une `Analysis` (statut `PENDING`) avec ses lignes `Dependency`, et met en file un job BullMQ sur la queue `stackiq-analysis`. Il retourne l'analyse et son `resultToken`.
3. Le service `worker` consomme la queue (`worker/src/index.ts` -> `analysisProcessor.ts`) :
   - passe l'analyse au statut `PROCESSING`
   - pour chaque dépendance : récupère les données GitHub/npm et l'historique des issues (en utilisant le cache d'analyse des dépendances si disponible), puis la score
   - enregistre les lignes `DependencyScore` au fur et à mesure, ainsi que le `AnalysisResult` agrégé
   - passe l'analyse à `COMPLETED`, ou à `FAILED` avec un message d'erreur en cas d'exception
   - exécute l'analyse des relations entre dépendances et enregistre les lignes `DependencyRelationship`
   - si un email a été fourni, génère un rapport PDF et envoie le résultat par email
4. Un second service, `worker-scheduler`, utilise la même image worker mais avec le traitement des jobs désactivé et les schedulers activés (`WORKER_PROCESS_JOBS=false`, `WORKER_ENABLE_SCHEDULERS=true`). Il exécute `weeklyRefresh.ts` et `leaderboardSync.ts`, qui alimentent la table `LeaderboardRepository` indépendamment des analyses soumises par les utilisateurs.
5. Le frontend communique avec le backend uniquement via `frontend/src/service/ApiService.tsx`.

### Déroulement d'une analyse

![anaylse_stack](images/analyse_stack.png)

![resultat_analyse](images/resultat_analyse.png)

![notification](images/recevoir_notification.png)

## Frontend

Les routes sont définies dans `frontend/src/router/router.tsx`, toutes imbriquées sous `MainLayout` :

- `/` -> `HomePage`
- `/explore` -> `LeaderboardPage`
- `/results/:resultToken` -> `ResultPage`
- `/results/:resultToken/dependency/:dependencyName` -> `DependencyDetailPage`

Tous les appels au backend passent par `frontend/src/service/ApiService.tsx`. Ajoutez les nouveaux appels au backend à cet endroit plutôt que d'appeler `fetch` directement depuis une page.

`frontend/src/reporting/` génère un export de rapport côté client. Notez qu'une logique séparée et similaire existe côté worker (`worker/src/reporting/fullStackReport.ts`) qui génère le PDF joint aux emails de résultat. Si vous modifiez le contenu d'un rapport, vérifiez si les deux doivent être mis à jour.

`frontend/src/i18n/` contient les traductions et le contexte de langue.

## Backend

`backend/src/app.ts` est le point d'entrée. Il monte :

- `/analyses` -> `api/route/analyses.ts`
- `/leaderboards` -> `api/route/leaderboards.ts`
- `/queue` -> `api/route/queue.ts`
- `/health` -> handler inline, vérifie Postgres et Redis

`api/route/analyses.ts` gère :

- `POST /analyses` - envoi d'un fichier `package.json`
- `POST /analyses/repository` - analyse un repo GitHub via owner/repo (récupère le `package.json` directement depuis le repo)
- `GET /analyses/:resultToken` - recherche une analyse ainsi que ses résultats, dépendances et relations

`db/client.ts` exporte le client Prisma. `redis/client.ts` exporte le client ioredis. `queue/analysisQueue.ts` encapsule la mise en file d'un job BullMQ (`enqueueAnalysisJob`) - utilisez-le plutôt que d'appeler BullMQ directement depuis une route.

`services/leaderboard*.ts` gèrent la lecture et le cache des données du leaderboard pour la route `/leaderboards`.

## Base de données

Base de données PostgreSQL unique. `backend/prisma/schema.prisma` et `backend/prisma/migrations/` sont la seule source de vérité. Le dossier `worker/prisma/` est un doublon hérité du passé et ne doit pas être utilisé pour exécuter des migrations, ni comme référence lors de modifications du schéma.

Le service backend applique les migrations automatiquement au démarrage (`npm run db:migrate:deploy`, voir `docker-compose.yml`). Pour modifier le schéma :

1. Modifier `backend/prisma/schema.prisma`.
2. Générer une migration depuis `backend/` avec la commande migrate de Prisma.
3. Redémarrer le backend (ou exécuter `npm run clean-start:db`) pour l'appliquer.

Tables principales :

- `Analysis` - une ligne par soumission, contient le statut et le `resultToken`.
- `Dependency` - dépendances/devDependencies parsées, rattachées à une `Analysis`.
- `AnalysisResult` - le score agrégé et le résumé d'une `Analysis`.
- `DependencyScore` - le score et le détail des métriques par dépendance.
- `DependencyRelationship` - relations détectées entre deux dépendances d'une même analyse.
- `DependencyAnalysisCache` - met en cache les données GitHub/npm/issue par dépendance pour éviter de les récupérer à nouveau lors d'analyses répétées.
- `DependencyRelationshipCache` - met en cache les résultats de relation entre un repo source et un package cible.
- `StackRequestStat`, `DependencyRequestStat` - compteurs d'utilisation.
- `LeaderboardRepository` - données derrière la page leaderboard `/explore`, alimentées par le scheduler.

### Diagramme relationnel

![relational_diagram](images/diagramme_relationnel.png)

## Workers

`worker/src/index.ts` est le point d'entrée pour les deux modes du worker, contrôlés par des variables d'environnement :

- `WORKER_PROCESS_JOBS` - si différent de `false`, démarre un `Worker` BullMQ qui exécute `processAnalysisJob` pour chaque job.
- `WORKER_ENABLE_SCHEDULERS` - si différent de `false`, démarre `weeklyRefresh.ts` et exécute `leaderboardSync.ts` une fois au démarrage.

`analysisProcessor.ts` est le pipeline exécuté par job décrit dans Architecture. Les éléments clés qu'il appelle :

- `adapters/githubMinerAdapter.ts` - récupère les données GitHub + npm d'une dépendance, via `gitHubMiner/index.ts`.
- `adapters/issuesMining.adapter.ts` - récupère et résume l'historique des issues, via `issuesMining/run_all.js`.
- `cache/dependencyAnalysisCache.ts` - recherche/enregistre les résultats en cache par dépendance, avec un verrou Redis pour éviter le travail en double entre jobs concurrents.
- `dependencyScore.ts` - scoring (voir ci-dessous).
- `dependencyRelationships.ts` - détection des relations entre dépendances, avec son propre cache.

## Je veux modifier les métriques des issues

La chaîne est :

`adapters/issuesMining.adapter.ts` -> `issuesMining/run_all.js` -> `issues.js` (récupère les données brutes des issues/timeline depuis GitHub GraphQL) -> `summarize.js` (transforme chaque issue brute en un `IssueSummary`) -> `analyze.js` (calcule l'objet `IssuesMiningMetrics` : taux, temps de résolution, tailles d'échantillon).

Pour ajouter ou modifier une métrique :

1. Calculez-la dans `analyze.js` (et ajoutez-la à `nullMetrics()` pour le cas sans issues).
2. Faites-la transiter par `issuesMining.adapter.ts`, qui copie les champs de `result.classifications` vers `IssuesMiningMetrics`.
3. Ajoutez le champ à `worker/src/types/issuesMining.types.ts`.
4. Si elle doit influencer le score, connectez-la dans `normalizeInputs()` dans `dependencyScore.ts`.

Les tailles d'échantillon par bucket (`recentOpen`, `recentClosed`, `olderClosed`, `oldOpen`) sont contrôlées par les variables d'environnement `ISSUES_MINING_*` et plafonnées par rapport à `ISSUES_MINING_MAX_ISSUES` via `capSampleBuckets()` dans `issues.js`.

Aucun changement de base de données n'est nécessaire, car toutes les métriques d'issues sont enregistrées au format json, qui peut évoluer librement.

## Je veux modifier le calcul du score

Toute la logique de scoring se trouve dans `worker/src/dependencyScore.ts`.

- `normalizeInputs()` convertit les métriques brutes GitHub/npm/issue en valeurs de 0 à 100, à l'aide d'utilitaires comme `normalizeLogMetric`, `normalizeCappedMetric`, `normalizeRate`. Ajoutez une nouvelle métrique ici et dans `NormalizedInputs`.
- `scoreDependency()` combine les entrées normalisées en trois sous-scores (`npmHealthScore`, `githubHealthScore`, `issueResolutionScore`) à l'aide de `weightedAverage()` avec des poids fixes, puis combine ces trois sous-scores en le score final par dépendance.
- `scoreDependencies()` agrège tous les scores de dépendances en un `globalScore` pour l'ensemble de l'analyse. Les devDependencies ont un poids de 0.5x par rapport à une dépendance normale.
- `getRiskLevel()` associe un score à `LOW` / `MEDIUM` / `HIGH` (seuils : 80, 60).

Pour modifier un poids, éditez l'appel `weightedAverage()` correspondant. Pour modifier ce qui alimente un sous-score, ajoutez ou retirez une entrée dans ce tableau.

Tests à mettre à jour en parallèle des modifications : `worker/src/dependencyScore.test.ts` et `worker/src/tests/dependencyScore.test.ts`.

## Je veux ajouter une API

Les routes se trouvent dans `backend/src/api/route/`. Suivez le modèle de `analyses.ts` :

1. Créez un nouveau fichier exportant un `Router` Express.
2. Utilisez `prisma` depuis `backend/src/db/client.ts` pour l'accès à la DB.
3. Montez-le dans `backend/src/app.ts` avec `app.use("/path", yourRouter)`.
4. Ajoutez des tests dans `backend/src/api/tests/`.
5. Si le frontend en a besoin, ajoutez une fonction dans `frontend/src/service/ApiService.tsx`.

Si le nouvel endpoint doit déclencher un travail d'analyse, mettez en file un job via `queue/analysisQueue.ts` (`enqueueAnalysisJob`) plutôt que d'appeler directement la logique du worker - le worker est un processus séparé et n'est joignable que via la queue.