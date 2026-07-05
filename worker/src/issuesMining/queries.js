// queries.js

const nbItemsPerQuery = Number(process.env.ISSUES_MINING_TIMELINE_ITEMS ?? 15);

function projectQuery(_owner, _name, _cursor, since) {
  let cursor = _cursor !== "" ? `, after:"${_cursor}"` : "";
  if (since == null) since = "2025-01-01";
  let sinceDate = since + "T00:00:00.000+0000";

  return `
    {
      repository(owner: "${_owner}", name: "${_name}") {
        nameWithOwner
        issues(first: 1${cursor}, filterBy: {since:"${sinceDate}"}) {
          totalCount
          edges {
            cursor
            node {
              title
              url
              bodyText
              bodyHTML
              author {
                login
                url
                __typename
              }
              authorAssociation
              publishedAt
              closedAt
              lastEditedAt
              reactionGroups {
                content
                createdAt
                users(first: 0) {
                  totalCount
                }
              }
              labels(first: 100) {
                totalCount
                nodes {
                  createdAt
                  name
                  isDefault
                }
              }
              assignees {
                totalCount
              }
              items: timelineItems(first: ${nbItemsPerQuery}) {
                totalCount
                pageInfo {
                  endCursor
                  hasNextPage
                }
                edges {
                  node {                
                    __typename
                    ... on AddedToProjectEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on AssignedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                      assignee {
                        ... on Bot {
                          login
                          url
                        }
                        ... on User {
                          login
                          url
                        }
                        ... on Organization {
                          login
                          url
                        }
                        ... on Mannequin {
                          login
                          url
                        }
                      }
                    }
                    ... on ClosedEvent {
                      id
                      createdAt
                      stateReason
                      actor {
                        login
                        url
                        __typename
                      }
                      closer{
                        __typename
                        ... on Commit{
                          id
                          url
                          author{
                            user{
                              login
                              url
                              __typename
                            }
                          }
                        }
                        ... on PullRequest{
                          id
                          url
                          merged
                          baseRepository{
                            name
                            nameWithOwner
                          }
                          state
                          isCrossRepository
                          author{                        
                              login
                              url
                              __typename                        
                          }                      
                        }
                      }
                    }
                    ... on CommentDeletedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on ConvertedNoteToIssueEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on CrossReferencedEvent {
                      id
                      createdAt
                      isCrossRepository
                      referencedAt
                      willCloseTarget
                      actor {
                        login
                        url
                        __typename
                      }
                      source {
                        __typename
                        ... on Issue {
                          id
                          url
                          databaseId
                          createdAt
                          closedAt
                          number
                          title
                          repository {
                            nameWithOwner
                          }
                          author {
                            login
                            url
                            __typename
                          }
                        }
                        ... on PullRequest {
                          id
                          url
                          databaseId
                          baseRefName
                          createdAt
                          closed
                          state
                          isCrossRepository
                          closedAt                          
                          merged
                          mergedAt
                          number
                          baseRepository{
                            name
                            nameWithOwner
                          }
                          title
                          bodyText
                          repository {
                            nameWithOwner
                            name
                          }
                          author {
                            login
                            url
                            __typename
                          }
                        }
                      }
                      target {
                        __typename
                        ... on Issue {
                          id
                          url
                          databaseId
                          createdAt
                          closedAt
                          number
                          title
                          repository {
                            nameWithOwner
                          }
                          author {
                            login
                            url
                            __typename
                          }
                        }
                        ... on PullRequest {
                          id
                          url
                          databaseId
                          baseRefName
                          createdAt
                          isCrossRepository
                          closedAt        
                          state                  
                          merged
                          mergedAt
                          number
                          title
                          bodyText
                          baseRepository{
                            name
                            nameWithOwner
                          }
                          repository {
                            name
                            nameWithOwner
                          }
                          author {
                            login
                            url
                            __typename
                          }
                        }
                      }
                    }
                    ... on DemilestonedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                      milestoneTitle
                    }
                    ... on IssueComment {
                      id
                      url
                      createdAt
                      updatedAt
                      bodyText
                      bodyHTML
                      isMinimized
                      lastEditedAt
                      minimizedReason
                      databaseId
                      editor {
                        login
                        url
                        __typename
                      }
                      author {
                        login
                        url
                        __typename
                      }
                      authorAssociation
                      publishedAt
                      reactionGroups {
                        content
                        createdAt
                        users(first: 0) {
                          totalCount
                        }
                      }
                    }
                    ... on LabeledEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                      label {
                        name
                        createdAt
                        url
                        isDefault
                      }
                    }
                    ... on LockedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                      lockReason
                    }
                    ... on MarkedAsDuplicateEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on MentionedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on MilestonedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                      milestoneTitle
                    }
                    ... on MovedColumnsInProjectEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on PinnedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on ReferencedEvent {
                      id
                      createdAt
                      isCrossRepository
                      commit {
                        committedDate
                        url
                        pushedDate
                        message
                        messageBody
                        messageHeadline                        
                        associatedPullRequests(first: 0) {
                          totalCount
                        }
                        author {
                          user {
                            login
                            url
                            __typename
                          }
                        }
                        signature {
                          signature
                        }
                      }
                      commitRepository {
                        nameWithOwner
                      }
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on RemovedFromProjectEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on RenamedTitleEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                      currentTitle
                      previousTitle
                    }
                    ... on ReopenedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on SubscribedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on TransferredEvent {
                      id
                      createdAt
                      fromRepository {
                        nameWithOwner
                      }
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on UnassignedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                      assignee {
                        ... on Bot {
                          login
                          url
                        }
                        ... on User {
                          login
                          url
                        }
                        ... on Organization {
                          login
                          url
                        }
                        ... on Mannequin {
                          login
                          url
                        }
                      }
                    }
                    ... on UnlabeledEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                      }
                      label {
                        name
                        createdAt
                        isDefault
                      }
                    }
                    ... on UnlockedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on UnpinnedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on UnsubscribedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                    }
                    ... on UserBlockedEvent {
                      id
                      createdAt
                      actor {
                        login
                        url
                        __typename
                      }
                      blockDuration
                      subject {
                        login
                        url
                        __typename
                      }
                    }
                  }
                }
              }
              reactionGroups {
                content
                createdAt
                users(first: 0) {
                  totalCount
                }
              }
              closed
              locked
              includesCreatedEdit
              number
              id
              databaseId
              milestone {
                number
                closed
                closedAt
                createdAt
                creator {
                  login
                  url
                  __typename
                }
                description
                dueOn
                title
                updatedAt
              }
              
            }
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
      rateLimit {
        limit
        cost
        remaining
        resetAt
      }
    }
   
`;
}

function issueItemQuery(_owner, _name, _cursor, _ccursor) {
  let cursor = _cursor !== "" ? `, after:"${_cursor}"` : "";
  let ccursor = _ccursor !== "" ? `, after:"${_ccursor}"` : "";

  return `
    {
        repository(owner: "${_owner}", name: "${_name}") {
          nameWithOwner
          issues(first: 1${cursor}) {
            totalCount
            pageInfo {
                endCursor
                hasNextPage
              }
            edges {
              cursor
              node {                
                url
                items: timelineItems(first: ${nbItemsPerQuery}${ccursor}) {
                  totalCount
                  pageInfo {
                    endCursor
                    hasNextPage
                  }
                  edges {
                    node {                
                      __typename
                      ... on AddedToProjectEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on AssignedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                        assignee {
                          ... on Bot {
                            login
                            url
                          }
                          ... on User {
                            login
                            url
                          }
                          ... on Organization {
                            login
                            url
                          }
                          ... on Mannequin {
                            login
                            url
                          }
                        }
                      }
                      ... on ClosedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                        closer{
                          __typename
                          ... on Commit{
                            id
                            url
                            author{
                              user{
                                login
                                url
                                __typename
                              }
                            }
                          }
                          ... on PullRequest{
                            id
                            url
                            author{                        
                                login
                                url
                                __typename                        
                            }                      
                          }
                        }
                      }
                      ... on CommentDeletedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on ConvertedNoteToIssueEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on CrossReferencedEvent {
                        id
                        createdAt
                        isCrossRepository
                        referencedAt
                        willCloseTarget
                        actor {
                          login
                          url
                          __typename
                        }
                        source {
                          __typename
                          ... on Issue {
                            id
                            url
                            databaseId
                            createdAt
                            closedAt
                            number
                            title
                            repository {
                              nameWithOwner
                            }
                            author {
                              login
                              url
                              __typename
                            }
                          }
                          ... on PullRequest {
                            id
                            url
                            databaseId
                            baseRefName
                            createdAt
                            closedAt                          
                            merged
                            mergedAt
                            number
                            title
                            bodyText
                            repository {
                              nameWithOwner
                            }
                            author {
                              login
                              url
                              __typename
                            }
                          }
                        }
                        target {
                          __typename
                          ... on Issue {
                            id
                            url
                            databaseId
                            createdAt
                            closedAt
                            number
                            title
                            repository {
                              nameWithOwner
                            }
                            author {
                              login
                              url
                              __typename
                            }
                          }
                          ... on PullRequest {
                            id
                            url
                            databaseId
                            baseRefName
                            createdAt
                            closedAt                          
                            merged
                            mergedAt
                            number
                            title
                            bodyText
                            repository {
                              nameWithOwner
                            }
                            author {
                              login
                              url
                              __typename
                            }
                          }
                        }
                      }
                      ... on DemilestonedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                        milestoneTitle
                      }
                      ... on IssueComment {
                        id
                        url
                        createdAt
                        updatedAt
                        bodyText
                        isMinimized
                        lastEditedAt
                        minimizedReason
                        databaseId
                        editor {
                          login
                          url
                          __typename
                        }
                        author {
                          login
                          url
                          __typename
                        }
                        authorAssociation
                        publishedAt
                        reactionGroups {
                          content
                          createdAt
                          users(first: 0) {
                            totalCount
                          }
                        }
                      }
                      ... on LabeledEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                        label {
                          name
                          createdAt
                          url
                          isDefault
                        }
                      }
                      ... on LockedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                        lockReason
                      }
                      ... on MarkedAsDuplicateEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on MentionedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on MilestonedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                        milestoneTitle
                      }
                      ... on MovedColumnsInProjectEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on PinnedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on ReferencedEvent {
                        id
                        createdAt
                        isCrossRepository
                        commit {
                          committedDate
                          url
                          pushedDate
                          message
                          messageBody
                          messageHeadline                        
                          associatedPullRequests(first: 0) {
                            totalCount
                          }
                          author {
                            user {
                              login
                              url
                              __typename
                            }
                          }
                          signature {
                            signature
                          }
                        }
                        commitRepository {
                          nameWithOwner
                        }
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on RemovedFromProjectEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on RenamedTitleEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                        currentTitle
                        previousTitle
                      }
                      ... on ReopenedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on SubscribedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on TransferredEvent {
                        id
                        createdAt
                        fromRepository {
                          nameWithOwner
                        }
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on UnassignedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                        assignee {
                          ... on Bot {
                            login
                            url
                          }
                          ... on User {
                            login
                            url
                          }
                          ... on Organization {
                            login
                            url
                          }
                          ... on Mannequin {
                            login
                            url
                          }
                        }
                      }
                      ... on UnlabeledEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                        }
                        label {
                          name
                          createdAt
                          isDefault
                        }
                      }
                      ... on UnlockedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on UnpinnedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on UnsubscribedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                      }
                      ... on UserBlockedEvent {
                        id
                        createdAt
                        actor {
                          login
                          url
                          __typename
                        }
                        blockDuration
                        subject {
                          login
                          url
                          __typename
                        }                  
                      }
                    }
                  }
                }                
              }
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        }
        rateLimit {
          limit
          cost
          remaining
          resetAt
        }
      }      
  `;
}

export { projectQuery, issueItemQuery };
