import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://neoforgeengineering.github.io",
  base: "/openaios",
  integrations: [
    starlight({
      title: "openAIOS",
      description:
        "Model-agnostic, secure-by-default AI agent orchestration OS",
      logo: {
        dark: "./src/assets/logo-dark.svg",
        light: "./src/assets/logo-light.svg",
        replacesTitle: false,
      },
      social: {
        github: "https://github.com/NeoForgeEngineering/openaios",
      },
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Getting Started",
          autogenerate: { directory: "getting-started" },
        },
        {
          label: "Architecture",
          autogenerate: { directory: "architecture" },
        },
        {
          label: "Guides",
          autogenerate: { directory: "guides" },
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
      ],
      head: [
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content:
              "https://neoforgeengineering.github.io/openaios/og-image.png",
          },
        },
      ],
      editLink: {
        baseUrl:
          "https://github.com/NeoForgeEngineering/openaios/edit/main/site/",
      },
    }),
  ],
});
