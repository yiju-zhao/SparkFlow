// apps/web/prisma/seed-explore.ts
// Run with: npx tsx prisma/seed-explore.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding explore data...')

  // Create venues
  const cvpr = await prisma.venue.create({
    data: {
      name: 'CVPR',
      type: 'conference',
      description: 'Conference on Computer Vision and Pattern Recognition'
    }
  })

  const neurips = await prisma.venue.create({
    data: {
      name: 'NeurIPS',
      type: 'conference',
      description: 'Conference on Neural Information Processing Systems'
    }
  })

  const iclr = await prisma.venue.create({
    data: {
      name: 'ICLR',
      type: 'conference',
      description: 'International Conference on Learning Representations'
    }
  })

  console.log('Created venues:', cvpr.name, neurips.name, iclr.name)

  // Create instances
  const cvpr2024 = await prisma.instance.create({
    data: {
      venueId: cvpr.id,
      year: 2024,
      name: 'CVPR 2024',
      startDate: new Date('2024-06-17'),
      endDate: new Date('2024-06-21'),
      location: 'Seattle, WA',
      website: 'https://cvpr.thecvf.com/Conferences/2024',
      summary: 'The premier annual computer vision event comprising the main conference and several co-located workshops and short courses.'
    }
  })

  const neurips2024 = await prisma.instance.create({
    data: {
      venueId: neurips.id,
      year: 2024,
      name: 'NeurIPS 2024',
      startDate: new Date('2024-12-09'),
      endDate: new Date('2024-12-15'),
      location: 'Vancouver, BC',
      website: 'https://neurips.cc/Conferences/2024',
      summary: 'The thirty-eighth annual conference on Neural Information Processing Systems.'
    }
  })

  const iclr2024 = await prisma.instance.create({
    data: {
      venueId: iclr.id,
      year: 2024,
      name: 'ICLR 2024',
      startDate: new Date('2024-05-07'),
      endDate: new Date('2024-05-11'),
      location: 'Vienna, Austria',
      website: 'https://iclr.cc/Conferences/2024'
    }
  })

  console.log('Created instances:', cvpr2024.name, neurips2024.name, iclr2024.name)

  // Create sample publications for CVPR 2024
  const pub1 = await prisma.publication.create({
    data: {
      instanceId: cvpr2024.id,
      title: 'Vision Transformers for Dense Prediction',
      authors: ['John Doe', 'Jane Smith', 'Bob Wilson'],
      abstract: 'We present a novel approach to dense prediction using vision transformers. Our method achieves state-of-the-art results on semantic segmentation and depth estimation benchmarks.',
      summary: 'A breakthrough in applying transformer architectures to pixel-level prediction tasks.',
      affiliations: ['Stanford University', 'Google Research'],
      countries: ['USA'],
      keywords: ['vision transformers', 'dense prediction', 'semantic segmentation'],
      researchTopic: 'Computer Vision',
      rating: 8.5,
      doi: '10.1234/cvpr2024.001',
      pdfUrl: 'https://arxiv.org/pdf/2024.00001.pdf'
    }
  })

  const pub2 = await prisma.publication.create({
    data: {
      instanceId: cvpr2024.id,
      title: 'Self-Supervised Learning for Video Understanding',
      authors: ['Alice Johnson', 'Charlie Brown', 'Diana Lee'],
      abstract: 'A comprehensive study of self-supervised learning methods for video understanding tasks including action recognition and temporal localization.',
      affiliations: ['MIT', 'Meta AI'],
      countries: ['USA'],
      keywords: ['self-supervised learning', 'video understanding', 'action recognition'],
      researchTopic: 'Video Analysis',
      rating: 7.8
    }
  })

  const pub3 = await prisma.publication.create({
    data: {
      instanceId: cvpr2024.id,
      title: 'Neural Radiance Fields for Dynamic Scenes',
      authors: ['Eve Martinez', 'Frank Chen'],
      abstract: 'We extend neural radiance fields to handle dynamic scenes with moving objects and changing lighting conditions.',
      affiliations: ['UC Berkeley', 'NVIDIA'],
      countries: ['USA'],
      keywords: ['NeRF', 'dynamic scenes', '3D reconstruction'],
      researchTopic: '3D Vision',
      rating: 8.2
    }
  })

  // Create publications for NeurIPS 2024
  await prisma.publication.createMany({
    data: [
      {
        instanceId: neurips2024.id,
        title: 'Scaling Laws for Large Language Models',
        authors: ['Grace Wang', 'Henry Liu', 'Ivy Chen'],
        abstract: 'We investigate the scaling behavior of large language models and derive new scaling laws that accurately predict model performance.',
        affiliations: ['OpenAI', 'Anthropic'],
        countries: ['USA'],
        keywords: ['scaling laws', 'LLM', 'language models'],
        researchTopic: 'Natural Language Processing',
        rating: 9.1
      },
      {
        instanceId: neurips2024.id,
        title: 'Efficient Attention Mechanisms for Long Sequences',
        authors: ['Jack Brown', 'Kate Wilson'],
        abstract: 'Novel attention mechanisms that scale linearly with sequence length while maintaining model quality.',
        affiliations: ['DeepMind', 'University of Toronto'],
        countries: ['UK', 'Canada'],
        keywords: ['attention', 'transformers', 'efficiency'],
        researchTopic: 'Deep Learning',
        rating: 8.7
      }
    ]
  })

  // Create publications for ICLR 2024
  await prisma.publication.createMany({
    data: [
      {
        instanceId: iclr2024.id,
        title: 'Representation Learning with Contrastive Methods',
        authors: ['Leo Kim', 'Maria Garcia'],
        abstract: 'A unified framework for understanding and improving contrastive representation learning methods.',
        affiliations: ['FAIR', 'Princeton University'],
        countries: ['USA'],
        keywords: ['contrastive learning', 'representation learning', 'self-supervised'],
        researchTopic: 'Representation Learning',
        rating: 8.4
      }
    ]
  })

  console.log('Created publications')

  // Create sample sessions for CVPR 2024
  const session1 = await prisma.conferenceSession.create({
    data: {
      instanceId: cvpr2024.id,
      title: 'Oral Session: Vision Transformers',
      type: 'oral',
      date: new Date('2024-06-18'),
      startTime: '09:00',
      endTime: '10:30',
      location: 'Hall A',
      abstract: 'Presentations on the latest advances in vision transformers and their applications.'
    }
  })

  const session2 = await prisma.conferenceSession.create({
    data: {
      instanceId: cvpr2024.id,
      title: 'Poster Session: Self-Supervised Learning',
      type: 'poster',
      date: new Date('2024-06-19'),
      startTime: '14:00',
      endTime: '16:00',
      location: 'Exhibition Hall'
    }
  })

  await prisma.conferenceSession.create({
    data: {
      instanceId: cvpr2024.id,
      title: 'Workshop: 3D Vision and Neural Rendering',
      type: 'workshop',
      date: new Date('2024-06-21'),
      startTime: '09:00',
      endTime: '17:00',
      location: 'Room 201',
      overview: 'A full-day workshop on 3D vision, neural rendering, and their applications in AR/VR.'
    }
  })

  // Create sessions for NeurIPS 2024
  await prisma.conferenceSession.createMany({
    data: [
      {
        instanceId: neurips2024.id,
        title: 'Tutorial: Foundation Models',
        type: 'tutorial',
        date: new Date('2024-12-09'),
        startTime: '09:00',
        endTime: '12:00',
        location: 'Main Hall'
      },
      {
        instanceId: neurips2024.id,
        title: 'Oral Session: Language Models',
        type: 'oral',
        date: new Date('2024-12-11'),
        startTime: '14:00',
        endTime: '16:00',
        location: 'Hall B'
      }
    ]
  })

  console.log('Created sessions')

  // Link publications to sessions
  await prisma.sessionPublication.create({
    data: {
      sessionId: session1.id,
      publicationId: pub1.id,
      presentationOrder: 1
    }
  })

  await prisma.sessionPublication.create({
    data: {
      sessionId: session2.id,
      publicationId: pub2.id,
      presentationOrder: 1
    }
  })

  await prisma.sessionPublication.create({
    data: {
      sessionId: session1.id,
      publicationId: pub3.id,
      presentationOrder: 2
    }
  })

  console.log('Linked publications to sessions')

  console.log('Seed data created successfully!')
}

main()
  .catch((e) => {
    console.error('Error seeding data:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
