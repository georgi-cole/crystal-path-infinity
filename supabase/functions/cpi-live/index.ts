import { createCpiLiveFunction } from './bootstrap.ts';
Deno.serve(createCpiLiveFunction((name) => Deno.env.get(name)));
