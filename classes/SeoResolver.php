<?php

declare(strict_types=1);

namespace Grav\Plugin\IntentionSeo;

use Grav\Common\Grav;
use Grav\Common\Page\Interfaces\PageInterface;

/**
 * Resolves indexing, titles, descriptions, and share images for one page.
 * Does not call other plugins.
 */
class SeoResolver
{
    public function __construct(private Grav $grav)
    {
    }

    public function siteIndex(): bool
    {
        return $this->truthy($this->grav['config']->get('plugins.intention-seo.site_index'), true);
    }

    public function isNoindex(PageInterface $page): bool
    {
        return $this->robotsContent($page) !== null;
    }

    /**
     * Robots meta content, or null when the page should stay indexable.
     */
    public function robotsContent(PageInterface $page): ?string
    {
        $legacy = trim((string) $this->headerValue($page, 'robots'));
        $legacyNoindex = $legacy !== '' && str_contains(strtolower($legacy), 'noindex');

        // Modular and other non-routable pages have no URL, except pages such as
        // the 404 template that are rendered and already carry a robots header.
        if (!$page->routable()) {
            return $legacyNoindex ? $legacy : null;
        }

        if (!$this->siteIndex()) {
            return 'noindex';
        }

        $choice = strtolower(trim((string) $this->headerValue($page, 'seo.robots')));
        if ($choice === 'noindex') {
            return 'noindex';
        }

        if ($legacyNoindex) {
            return $legacy;
        }

        return null;
    }

    public function documentTitle(PageInterface $page): string
    {
        $custom = trim((string) $this->headerValue($page, 'seo.title'));
        if ($custom !== '') {
            return $custom;
        }

        $title = trim((string) $page->title());
        $site = trim((string) $this->grav['config']->get('site.title'));
        if ($title !== '' && $site !== '') {
            return $title . ' | ' . $site;
        }

        return $title !== '' ? $title : $site;
    }

    public function pageDescription(PageInterface $page): string
    {
        return trim($this->stringValue($this->headerValue($page, 'metadata.description')));
    }

    public function openGraph(PageInterface $page): array
    {
        $title = trim((string) $this->headerValue($page, 'seo.og_title'));
        if ($title === '') {
            $title = trim((string) $this->headerValue($page, 'seo.title'));
        }
        if ($title === '') {
            $title = $this->documentTitle($page);
        }
        if ($title === '') {
            $title = trim((string) $this->grav['config']->get('plugins.intention-seo.og_title'));
        }

        $description = trim((string) $this->headerValue($page, 'seo.og_description'));
        if ($description === '') {
            $description = $this->pageDescription($page);
        }
        if ($description === '') {
            $description = trim((string) $this->grav['config']->get('plugins.intention-seo.og_description'));
        }
        if ($description === '') {
            $description = trim((string) $this->grav['config']->get('site.metadata.description'));
        }

        $image = $this->shareImage($page);

        return [
            'og_title' => $title,
            'og_description' => $description,
            'og_image' => $image['url'] ?? '',
            'og_image_alt' => ($image['alt'] ?? '') !== '' ? $image['alt'] : trim((string) $page->title()),
            'og_url' => $page->url(true, true),
            'og_type' => $page->template() === 'item' ? 'article' : 'website',
            'og_site_name' => trim((string) $this->grav['config']->get('site.title')),
            'twitter_card' => 'summary_large_image',
        ];
    }

    /**
     * @return array{url: string, alt: string}|null
     */
    public function shareImage(PageInterface $page): ?array
    {
        $explicit = $this->mediaUrl($page, $this->stringValue($this->headerValue($page, 'seo.og_image')));
        if ($explicit !== null) {
            return ['url' => $explicit, 'alt' => trim((string) $page->title())];
        }

        $featured = $this->stringValue($this->headerValue($page, 'featured_image'));
        $featuredUrl = $this->mediaUrl($page, $featured);
        if ($featuredUrl !== null) {
            return [
                'url' => $featuredUrl,
                'alt' => trim((string) $this->headerValue($page, 'featured_image_alt')),
            ];
        }

        $images = $page->media()->images();
        $first = is_array($images) ? reset($images) : null;
        if ($first && method_exists($first, 'url')) {
            return ['url' => $this->absolute((string) $first->url()), 'alt' => trim((string) $page->title())];
        }

        $hero = $this->heroImage($page);
        if ($hero !== null) {
            return $hero;
        }

        $site = $this->siteImageUrl();
        if ($site !== null) {
            return ['url' => $site, 'alt' => trim((string) $this->grav['config']->get('site.title'))];
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    public function listingRow(PageInterface $page): array
    {
        $description = $this->pageDescription($page);
        $title = $this->documentTitle($page);
        $index = $this->indexState($page);

        return [
            'route' => $page->route(),
            'raw_route' => method_exists($page, 'rawRoute') ? (string) ($page->rawRoute() ?: $page->route()) : $page->route(),
            'title_state' => $this->lengthState(mb_strlen($title), 50, 60, 30),
            'title_message' => $this->lengthMessage(mb_strlen($title), 50, 60, 30, $title),
            'description_state' => $this->lengthState(mb_strlen($description), 150, 160, 120),
            'description_message' => $this->lengthMessage(mb_strlen($description), 150, 160, 120, $description),
            'index_state' => $index['state'],
            'index_message' => $index['message'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function summary(PageInterface $page): array
    {
        $words = $this->wordCount($page);
        $row = $this->listingRow($page);

        return $row + [
            'routable' => $page->routable(),
            'document_title' => $this->documentTitle($page),
            'custom_title' => trim((string) $this->headerValue($page, 'seo.title')),
            'description' => $this->pageDescription($page),
            'word_count' => $words['count'],
            'word_note' => $words['note'],
        ];
    }

    public function applyRobots(PageInterface $page): void
    {
        $robots = $this->robotsContent($page);
        if ($robots === null) {
            return;
        }

        $header = $page->header();
        if (!is_object($header)) {
            return;
        }

        $metadata = $header->metadata ?? [];
        if (is_object($metadata)) {
            $metadata = (array) $metadata;
        }
        if (!is_array($metadata)) {
            $metadata = [];
        }
        $metadata['robots'] = $robots;
        $header->metadata = $metadata;

        if (method_exists($page, 'resetMetadata')) {
            $page->resetMetadata();
        }
    }

    /**
     * @return array{count: int, note: string}
     */
    public function wordCount(PageInterface $page): array
    {
        $body = method_exists($page, 'rawMarkdown') ? (string) $page->rawMarkdown() : '';
        $sectionText = $this->sectionText($page);
        $count = $this->words($body) + $this->words($sectionText);
        $note = $sectionText !== ''
            ? 'Counted from the saved page body and builder section text. Child pages are not included.'
            : 'Counted from the saved page body. Child pages are not included.';

        return ['count' => $count, 'note' => $note];
    }

    private function indexState(PageInterface $page): array
    {
        if (!$page->routable()) {
            return ['state' => 'none', 'message' => 'No public URL'];
        }
        if (!$this->siteIndex()) {
            return ['state' => 'site', 'message' => 'Noindex (site setting)'];
        }
        if ($this->robotsContent($page) !== null) {
            return ['state' => 'noindex', 'message' => 'Noindex'];
        }

        return ['state' => 'index', 'message' => 'Index'];
    }

    private function sectionText(PageInterface $page): string
    {
        $sections = $this->headerValue($page, 'sections');
        if (!is_array($sections) && !is_object($sections)) {
            return '';
        }

        $chunks = [];
        foreach ($sections as $section) {
            $section = (array) $section;
            foreach (['hero_body', 'text_body', 'text_image_caption', 'full_body', 'contact_body'] as $key) {
                if (isset($section[$key]) && is_string($section[$key])) {
                    $chunks[] = $section[$key];
                }
            }
            foreach (['boxes', 'faq'] as $listKey) {
                if (!isset($section[$listKey]) || !is_array($section[$listKey])) {
                    continue;
                }
                foreach ($section[$listKey] as $item) {
                    $item = (array) $item;
                    foreach (['title', 'body', 'content'] as $key) {
                        if (isset($item[$key]) && is_string($item[$key])) {
                            $chunks[] = $item[$key];
                        }
                    }
                }
            }
        }

        return trim(implode("\n", $chunks));
    }

    private function heroImage(PageInterface $page): ?array
    {
        $sections = $this->headerValue($page, 'sections');
        if (!is_array($sections) && !is_object($sections)) {
            return null;
        }

        foreach ($sections as $section) {
            $section = (array) $section;
            $raw = $section['hero_image_desktop'] ?? $section['hero_image'] ?? '';
            $url = $this->mediaUrl($page, $this->stringValue($raw));
            if ($url === null) {
                continue;
            }
            $alt = $section['hero_image_desktop_alt'] ?? $section['hero_image_alt'] ?? '';

            return ['url' => $url, 'alt' => is_string($alt) ? trim($alt) : ''];
        }

        return null;
    }

    private function siteImageUrl(): ?string
    {
        $value = $this->grav['config']->get('plugins.intention-seo.og_image');
        if (!is_array($value)) {
            return $this->publicPath($this->stringValue($value));
        }

        foreach ($value as $name => $meta) {
            if (is_array($meta) && isset($meta['path']) && is_string($meta['path']) && $meta['path'] !== '') {
                $url = $this->publicPath($meta['path']);
                if ($url !== null) {
                    return $url;
                }
            }
            if (is_string($name) && $name !== '') {
                $url = $this->publicPath('user/data/intention-seo/' . ltrim($name, '/'));
                if ($url !== null) {
                    return $url;
                }
            }
        }

        return null;
    }

    private function mediaUrl(PageInterface $page, string $value): ?string
    {
        $value = trim(str_replace('\\', '/', $value));
        if ($value === '') {
            return null;
        }

        if (!str_contains($value, '/')) {
            $medium = $page->media()[$value] ?? null;
            if ($medium && method_exists($medium, 'url')) {
                return $this->absolute((string) $medium->url());
            }
        }

        return $this->userMediaUrl($value);
    }

    private function userMediaUrl(string $value): ?string
    {
        $path = ltrim(str_replace('\\', '/', $value), '/');
        if (str_starts_with($path, 'user/media/')) {
            $path = substr($path, strlen('user/media/'));
        }
        $path = implode('/', array_map('rawurldecode', explode('/', $path)));
        $userDir = defined('USER_DIR') ? rtrim((string) USER_DIR, '/') : '';
        if ($userDir === '' || $path === '' || str_contains($path, '..')) {
            return null;
        }

        $full = $userDir . '/media/' . $path;
        if (!is_file($full)) {
            return null;
        }

        $encoded = implode('/', array_map('rawurlencode', explode('/', $path)));

        return $this->absolute('/user/media/' . $encoded);
    }

    private function publicPath(string $path): ?string
    {
        $path = trim(str_replace('\\', '/', $path));
        if ($path === '' || str_contains($path, '..')) {
            return null;
        }
        if (str_starts_with($path, 'user://')) {
            $path = 'user/' . ltrim(substr($path, strlen('user://')), '/');
        }
        $root = defined('GRAV_ROOT') ? (string) GRAV_ROOT : (string) getcwd();
        $root = rtrim(str_replace('\\', '/', $root), '/');
        $relative = ltrim($path, '/');
        if (!is_file($root . '/' . $relative)) {
            return null;
        }

        $encoded = implode('/', array_map('rawurlencode', explode('/', $relative)));

        return $this->absolute('/' . $encoded);
    }

    private function absolute(string $url): string
    {
        if (preg_match('#^https?://#i', $url)) {
            return $url;
        }
        if (str_starts_with($url, '//')) {
            return 'https:' . $url;
        }

        $base = rtrim((string) $this->grav['uri']->rootUrl(true), '/');
        if (!str_starts_with($url, '/')) {
            $url = '/' . $url;
        }

        return $base . $url;
    }

    private function headerValue(PageInterface $page, string $path): mixed
    {
        $node = $page->header();
        foreach (explode('.', $path) as $part) {
            if (is_object($node) && isset($node->{$part})) {
                $node = $node->{$part};
                continue;
            }
            if (is_array($node) && array_key_exists($part, $node)) {
                $node = $node[$part];
                continue;
            }

            return null;
        }

        return $node;
    }

    private function stringValue(mixed $value): string
    {
        if (is_string($value)) {
            return $value;
        }
        if (is_array($value) && isset($value['content']) && is_string($value['content'])) {
            return $value['content'];
        }
        if (is_object($value) && isset($value->content) && is_string($value->content)) {
            return $value->content;
        }

        return '';
    }

    private function words(string $text): int
    {
        $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/\[[^\]]+\]/', ' ', $text) ?? $text;
        if (!preg_match_all("/[\\p{L}\\p{N}']+/u", $text, $matches)) {
            return 0;
        }

        return count($matches[0]);
    }

    private function lengthState(int $length, int $greenMin, int $greenMax, int $amberMin): string
    {
        if ($length >= $greenMin && $length <= $greenMax) {
            return 'green';
        }
        if ($length >= $amberMin && $length < $greenMin) {
            return 'amber';
        }

        return 'red';
    }

    private function lengthMessage(int $length, int $greenMin, int $greenMax, int $amberMin, string $text): string
    {
        $state = $this->lengthState($length, $greenMin, $greenMax, $amberMin);
        $label = match ($state) {
            'green' => 'Good',
            'amber' => 'OK',
            default => 'Poor',
        };
        $shown = $text !== '' ? ' — ' . $text : '';

        return $label . ' — ' . $length . ' characters' . $shown;
    }

    private function truthy(mixed $value, bool $default): bool
    {
        if ($value === null) {
            return $default;
        }
        if (is_bool($value)) {
            return $value;
        }
        if (is_int($value) || is_float($value)) {
            return (int) $value !== 0;
        }
        if (is_string($value)) {
            return !in_array(strtolower($value), ['0', 'false', 'no', 'off', ''], true);
        }

        return $default;
    }
}
