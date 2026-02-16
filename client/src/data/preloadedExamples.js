// Pre-loaded example study plans for landing page
export const preloadedExamples = {
  'stripe': {
    id: 'stripe-example',
    url: 'https://stripe.com/jobs',
    companyName: 'Stripe',
    roleTitle: 'Software Engineer',
    logoUrl: 'https://logo.clearbit.com/stripe.com',
    timestamp: new Date().toISOString(),
    result: {
      companyInfo: {
        name: 'Stripe',
        roleTitle: 'Software Engineer',
        logo: 'https://logo.clearbit.com/stripe.com',
        logoUrl: 'https://logo.clearbit.com/stripe.com',
        founded: '2010',
        description: 'Stripe is a financial services and software as a service company. It provides payment processing software and application programming interfaces for e-commerce websites and mobile applications.',
        founders: [
          {
            name: 'Patrick Collison',
            background: 'Co-founder and CEO of Stripe. Previously co-founded Auctomatic.',
            linkedin: 'https://www.linkedin.com/in/patrickcollison/'
          },
          {
            name: 'John Collison',
            background: 'Co-founder and President of Stripe. Previously co-founded Auctomatic.',
            linkedin: 'https://www.linkedin.com/in/johncollison/'
          }
        ],
        fundingRounds: [
          {
            year: '2021',
            month: 'March',
            type: 'Series H',
            amount: '$600 million',
            leadInvestors: ['Allianz X, Axa, Baillie Gifford'],
            description: 'Valuation reached $95 billion'
          },
          {
            year: '2016',
            month: 'November',
            type: 'Series D',
            amount: '$150 million',
            leadInvestors: ['CapitalG, General Catalyst'],
            description: 'Valuation reached $9.2 billion'
          }
        ]
      },
      jobDescription: 'Stripe is looking for a Software Engineer to help build the infrastructure that powers global commerce. You will work on systems that process billions of dollars in payments and serve millions of users worldwide.',
      studyPlan: {
        summary: 'This role requires strong systems programming skills, experience with distributed systems, and a deep understanding of reliability engineering.',
        studyPlan: {
          topics: [
            {
              topic: 'Distributed Systems',
              description: 'Understanding of microservices, consensus algorithms, and distributed databases',
              keyPoints: [
                'CAP theorem and trade-offs',
                'Event-driven architectures',
                'Service mesh and API gateways',
                'Distributed transactions and eventual consistency'
              ],
              resources: [
                'https://www.amazon.com/Designing-Data-Intensive-Applications-Reliable-Maintainable/dp/1449373321',
                'https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html',
                'https://www.youtube.com/watch?v=Y6Ev8GXbYV8'
              ]
            },
            {
              topic: 'Payment Processing',
              description: 'Knowledge of payment systems, PCI compliance, and financial technology',
              keyPoints: [
                'Payment card industry (PCI) compliance',
                'Payment gateway architecture',
                'Fraud detection and prevention',
                'International payment methods'
              ],
              resources: [
                'https://stripe.com/docs',
                'https://www.pcisecuritystandards.org/',
                'https://stripe.com/docs/security'
              ]
            },
            {
              topic: 'Reliability Engineering',
              description: 'Building systems that are highly available and fault-tolerant',
              keyPoints: [
                'SLA/SLO/SLI definitions',
                'Error handling and retries',
                'Circuit breakers and bulkheads',
                'Chaos engineering'
              ],
              resources: [
                'https://sre.google/books/',
                'https://www.usenix.org/conference/srecon19americas/presentation/reed',
                'https://netflixtechblog.com/'
              ]
            }
          ]
        },
        interviewQuestions: {
          stages: [
            {
              stage: 'Technical Screen',
              questions: [
                {
                  question: 'How would you design a payment processing system that handles millions of transactions per second?',
                  answer: 'I would design a distributed system with multiple layers: API gateway for routing, payment service for processing, database sharding for scalability, and a message queue for asynchronous processing. Key considerations include idempotency, exactly-once semantics, and strong consistency for financial data.',
                  category: 'System Design'
                },
                {
                  question: 'Explain how you would ensure a payment transaction is processed exactly once, even if there are network failures.',
                  answer: 'I would use idempotency keys. Each transaction request includes a unique idempotency key. The system checks if this key has been processed before. If yes, return the previous result. If no, process the transaction and store the key with the result. This ensures idempotency even with retries.',
                  category: 'System Design'
                }
              ]
            },
            {
              stage: 'On-site Interview',
              questions: [
                {
                  question: 'How would you handle a situation where a payment is charged twice due to a system error?',
                  answer: 'First, implement idempotency to prevent this. If it still occurs, have a reconciliation system that detects duplicate charges, automatically refunds duplicates, and alerts the team. Implement monitoring and alerts for unusual patterns.',
                  category: 'Problem Solving'
                }
              ]
            }
          ]
        }
      },
      previewMode: false
    }
  },
  'notion': {
    id: 'notion-example',
    url: 'https://notion.so/careers',
    companyName: 'Notion',
    roleTitle: 'Product Manager',
    logoUrl: 'https://logo.clearbit.com/notion.so',
    timestamp: new Date().toISOString(),
    result: {
      companyInfo: {
        name: 'Notion',
        roleTitle: 'Product Manager',
        logo: 'https://logo.clearbit.com/notion.so',
        logoUrl: 'https://logo.clearbit.com/notion.so',
        founded: '2016',
        description: 'Notion is an all-in-one workspace for notes, docs, wikis, and project management. It combines the best of documents, spreadsheets, and databases into one powerful tool.',
        founders: [
          {
            name: 'Ivan Zhao',
            background: 'Co-founder and CEO of Notion. Previously worked at Inkling.',
            linkedin: 'https://www.linkedin.com/in/ivanhzhao/'
          }
        ],
        fundingRounds: [
          {
            year: '2021',
            month: 'October',
            type: 'Series C',
            amount: '$275 million',
            leadInvestors: ['Sequoia Capital, Coatue'],
            description: 'Valuation reached $10 billion'
          },
          {
            year: '2019',
            month: 'July',
            type: 'Series B',
            amount: '$50 million',
            leadInvestors: ['Index Ventures'],
            description: 'Led by Index Ventures'
          }
        ]
      },
      jobDescription: 'Notion is looking for a Product Manager to help shape the future of productivity software. You will work on features that millions of users rely on daily.',
      studyPlan: {
        summary: 'This role requires strong product sense, user empathy, and the ability to work cross-functionally with engineering and design teams.',
        studyPlan: {
          topics: [
            {
              topic: 'Product Strategy',
              description: 'Understanding how to define product vision, roadmap, and success metrics',
              keyPoints: [
                'OKRs and goal setting',
                'User research and validation',
                'Competitive analysis',
                'Prioritization frameworks (RICE, Kano model)'
              ],
              resources: [
                'https://www.intercom.com/resources/books/intercom-product-management',
                'https://www.mindtheproduct.com/',
                'https://www.productplan.com/glossary/'
              ]
            },
            {
              topic: 'User Experience Design',
              description: 'Understanding design principles and user-centered design',
              keyPoints: [
                'Design thinking process',
                'User personas and journey mapping',
                'Prototyping and testing',
                'Accessibility and inclusive design'
              ],
              resources: [
                'https://www.nngroup.com/articles/',
                'https://www.interaction-design.org/literature',
                'https://www.usertesting.com/blog'
              ]
            }
          ]
        },
        interviewQuestions: {
          stages: [
            {
              stage: 'Product Sense',
              questions: [
                {
                  question: 'How would you improve Notion\'s collaboration features?',
                  answer: 'I would start by understanding user pain points through research. Key areas to explore: real-time collaboration performance, comment threading, version history clarity, and permission management. I\'d prioritize based on user impact and technical feasibility.',
                  category: 'Product Thinking'
                }
              ]
            }
          ]
        }
      },
      previewMode: false
    }
  },
  'apple': {
    id: 'apple-example',
    url: 'https://www.apple.com/careers/',
    companyName: 'Apple',
    roleTitle: 'Senior iOS Engineer',
    logoUrl: 'https://logo.clearbit.com/apple.com',
    timestamp: new Date().toISOString(),
    result: {
      companyInfo: {
        name: 'Apple',
        roleTitle: 'Senior iOS Engineer',
        logo: 'https://logo.clearbit.com/apple.com',
        logoUrl: 'https://logo.clearbit.com/apple.com',
        founded: '1976',
        description: 'Apple Inc. is an American multinational technology company that designs, develops, and sells consumer electronics, computer software, and online services.',
        founders: [
          {
            name: 'Steve Jobs',
            background: 'Co-founder of Apple. Visionary leader who revolutionized personal computing, music, and mobile phones.',
            linkedin: null
          },
          {
            name: 'Steve Wozniak',
            background: 'Co-founder of Apple. Designed the Apple I and Apple II computers.',
            linkedin: 'https://www.linkedin.com/in/stevewoz'
          }
        ],
        fundingRounds: [
          {
            year: '1980',
            month: 'December',
            type: 'IPO',
            amount: '$101.2 million',
            leadInvestors: ['Public offering'],
            description: 'Apple went public at $22 per share'
          }
        ]
      },
      jobDescription: 'Apple is looking for a Senior iOS Engineer to work on the next generation of iOS features. You will work on frameworks and applications that power millions of devices.',
      studyPlan: {
        summary: 'This role requires deep expertise in iOS development, Swift, Objective-C, and Apple\'s frameworks. Strong understanding of performance optimization and user experience is essential.',
        studyPlan: {
          topics: [
            {
              topic: 'iOS Development',
              description: 'Mastery of Swift, Objective-C, and iOS frameworks',
              keyPoints: [
                'SwiftUI and UIKit',
                'Core Data and CloudKit',
                'Combine framework',
                'App architecture (MVVM, VIPER)'
              ],
              resources: [
                'https://developer.apple.com/documentation/',
                'https://www.hackingwithswift.com/',
                'https://www.raywenderlich.com/ios',
                'https://developer.apple.com/videos/'
              ]
            },
            {
              topic: 'Performance Optimization',
              description: 'Understanding how to build fast, responsive iOS applications',
              keyPoints: [
                'Instruments and profiling',
                'Memory management',
                'Background processing',
                'Battery optimization'
              ],
              resources: [
                'https://developer.apple.com/videos/play/wwdc2020/10077/',
                'https://developer.apple.com/videos/play/wwdc2019/417/',
                'https://developer.apple.com/library/archive/documentation/Performance/Conceptual/EnergyGuide-iOS/'
              ]
            },
            {
              topic: 'Apple Human Interface Guidelines',
              description: 'Understanding Apple\'s design principles and best practices',
              keyPoints: [
                'Design patterns and conventions',
                'Accessibility standards',
                'Platform-specific features',
                'App Store guidelines'
              ],
              resources: [
                'https://developer.apple.com/design/human-interface-guidelines/',
                'https://developer.apple.com/app-store/review/guidelines/',
                'https://developer.apple.com/accessibility/'
              ]
            }
          ]
        },
        interviewQuestions: {
          stages: [
            {
              stage: 'Technical Interview',
              questions: [
                {
                  question: 'Explain the difference between weak and strong references in Swift, and when you would use each.',
                  answer: 'Strong references create a retain cycle if two objects reference each other. Weak references don\'t increase the retain count and become nil when the referenced object is deallocated. Use weak for delegate patterns and parent-child relationships to avoid retain cycles. Use unowned when you know the reference will always be valid.',
                  category: 'iOS/Swift'
                },
                {
                  question: 'How would you optimize an iOS app that\'s experiencing memory pressure?',
                  answer: 'I would use Instruments to identify memory leaks and retain cycles. Implement proper memory management, use weak references where appropriate, lazy loading for images, and implement proper caching strategies. Profile with Allocations and Leaks instruments.',
                  category: 'Performance'
                }
              ]
            }
          ]
        }
      },
      previewMode: false
    }
  }
}

