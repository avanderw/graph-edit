<script>
  import { onMount } from 'svelte'

  export let kind = 'header'

  const siteOrigin = 'https://avanderw.co.za'
  const links = JSON.stringify([
    { href: `${siteOrigin}/sandbox`, text: 'Sandbox' },
    { href: './', text: 'Graph Edit' }
  ])
  let element

  onMount(() => {
    let cancelled = false
    let observer
    customElements.whenDefined(`site-${kind}`).then(() => {
      if (cancelled || !element?.shadowRoot) return
      const root = element.shadowRoot
      const resolveSiteLinks = () => {
        for (const anchor of root.querySelectorAll('a[href^="/"]')) {
          const href = anchor.getAttribute('href')
          if (!href.startsWith('//')) anchor.setAttribute('href', new URL(href, siteOrigin).href)
        }
      }
      resolveSiteLinks()
      observer = new MutationObserver(resolveSiteLinks)
      observer.observe(root, { childList: true, subtree: true })
    })
    return () => {
      cancelled = true
      observer?.disconnect()
    }
  })
</script>

{#if kind === 'header'}
  <site-header bind:this={element} home={siteOrigin} {links}>
    <a href={siteOrigin}>Andrew van der Westhuizen</a>
  </site-header>
{:else}
  <site-footer bind:this={element}>
    <a href={`${siteOrigin}/design-system`}>Design system and contact</a>
  </site-footer>
{/if}