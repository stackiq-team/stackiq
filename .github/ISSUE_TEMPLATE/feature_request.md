name: "Demande de fonctionnalité"
description: "Proposer une nouvelle fonctionnalité ou une amélioration"
title: "Feat: <titre de la fonctionnalité>"
labels: ["feature"]
body:
  - type: input
    id: summary
    attributes:
      label: Résumé
      description: Une phrase décrivant la fonctionnalité.
      placeholder: Mon petit résumé.
    validations:
      required: true

  - type: textarea
    id: problem
    attributes:
      label: Problème / motivation
      description: Quel problème ou quelle motivation cela résout-il ?
      placeholder: Avec l'état actuel de l'application, il y a un problème où...
    validations:
      required: true

  - type: textarea
    id: proposal
    attributes:
      label: Solution proposée
      description: Que faut-il faire pour résoudre le problème ? (Inclure des détails UX/API lorsque pertinent).
      placeholder: Ce problème peut être résolu en faisant...
    validations:
      required: true

  - type: textarea
    id: alternatives
    attributes:
      label: Solutions alternatives envisagées (optionnel)

  - type: textarea
    id: impact
    attributes:
      label: Risques et impact (optionnel)

  - type: checkboxes
    id: acceptance
    attributes:
      label: Critères d'acceptation
      options:
        - label: Implémentation de la fonctionnalité ajoutée
        - label: Tests unitaires et E2E ajoutés
        - label: Docs mises à jour (README / CHANGELOG)

  - type: dropdown
    id: priority
    attributes:
      label: Priorité
      options: ["P0 - critique", "P1 - haute", "P2 - moyenne", "P3 - faible"]
      default: 2

  - type: textarea
    id: additional
    attributes:
      label: Information supplémentaire / captures d'écran (optionnel)
