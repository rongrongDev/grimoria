import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { ROLES } from './lib/roles.mjs';

export const collections = {
  docs: defineCollection({
    loader: glob({
      base: '..',
      pattern: ROLES.map((role) => `${role}/**/*.md`),
    }),
  }),
};
