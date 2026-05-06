name: "Tâche / Maintenance"
description: "Refactor, mise à jour de dépendances, infrastructure, documentation | Pas de changement de fonctionnalités"
title: "chore: <titre court>"
labels: ["chore"]
body:
  - type: input
    id: summary
    attributes:
      label: Résumé de la tâche
      placeholder: Court résumé de la tâche à faire
    validations:
      required: true

  - type: textarea
    id: context
    attributes:
      label: Contexte
      description: Pourquoi cette tâche est-elle nécessaire? Liens vers issues/PRs.
      placeholder: |
        Cette tâche est nécessaire car...

        Issues/PRs liés:
        - 
    validations:
      required: true

  - type: checkboxes
    id: type
    attributes:
      label: Type de tâche
      options:
        - label: Ajout de tests
        - label: Mise à jour de la documentation (README / CHANGELOG)
        - label: Correction d'une dette technique
        - label: Refactorisation du code
        - label: Ajout/modification de workflows
        - label: Ajout/modification des modèles (tâches, PR, release, etc.)
    validations:
      required: true

  - type: textarea
    id: scope
    attributes:
      label: Périmètre (scope)
      description: Quelles actions doivent être faites?
    validations:
      required: true

  - type: textarea
    id: additional
    attributes:
      label: Information supplémentaire / captures d'écran (optionnel)

  - type: dropdown
    id: priority
    attributes:
      label: Priorité
      options: ["P0 - à faire absolument", "P1 - bientôt", "P2 - quand possible", "P3 - négligeable"]
      default: 2

