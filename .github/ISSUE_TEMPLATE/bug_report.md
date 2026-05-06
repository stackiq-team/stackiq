name: "Rapport de bug"
description: "Il y a un problème dans l'application"
title: "bug: <titre court>"
labels: ["bug"]
body:
  - type: input
    id: summary
    attributes:
      label: Résumé
      placeholder: Court résumé de la problèmatique
    validations:
      required: true

  - type: textarea
    id: steps
    attributes:
      label: Étapes pour reproduire
      description: Soyez précis. Incluez données de test ou commandes si utile.
      placeholder: |
        1. Première étape
        2. Deuxième étape
        3. Troisième étape
        ...
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Comportement attendu
      placeholder: L'application devrait faire ceci...
    validations:
      required: true

  - type: textarea
    id: actual
    attributes:
      label: Comportement observé
      placeholder: L'application agit de cette manière présentement...
    validations:
      required: true

  - type: textarea
    id: env
    attributes:
      label: Environnement
      description: L'appareil, l'OS, le navigateur et la version de l'application
      placeholder: |
        Appareil: Iphone, ordinateur windows, mac, etc.
        OS: iOS 26, Windows 11, macOS 7, etc.
        Navigateur: Chrome, firefox, safari, etc.
        Version (et commit si possible) de l'applicaiton:
    validations:
      required: true

  - type: textarea
    id: logs
    attributes:
      label: Logs / traces
      description: Collez les logs pertinents (masquez les secrets). Utilisez des blocs de code.

  - type: dropdown
    id: priority
    attributes:
      label: Priorité
      options: ["P0 - critique", "P1 - haute", "P2 - moyenne", "P3 - faible"]
      default: 2

  - type: checkboxes
    id: regression
    attributes:
      label: Régression ?
      options:
        - label: Fonctionnait dans une version précédente
        - label: Reproductible de manière fiable

  - type: textarea
    id: screenshots
    attributes:
      label: Captures d'écran / enregistrements (optionnel)
