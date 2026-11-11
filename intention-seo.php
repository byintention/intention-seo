<?php

declare(strict_types=1);

namespace Grav\Plugin;

use Composer\Autoload\ClassLoader;
use Grav\Common\Page\Interfaces\PageInterface;
use Grav\Common\Plugin;
use Grav\Events\PermissionsRegisterEvent;
use Grav\Framework\Acl\PermissionsReader;
use Grav\Plugin\IntentionSeo\SeoResolver;
use RocketTheme\Toolbox\Event\Event;

class IntentionSeoPlugin extends Plugin
{
    public static function getSubscribedEvents(): array
    {
        return [
            'onPluginsInitialized' => ['onPluginsInitialized', 0],
            PermissionsRegisterEvent::class => ['onRegisterPermissions', 0],
        ];
    }

    public function autoload(): ClassLoader
    {
        $loader = new ClassLoader();
        $loader->addPsr4('Grav\\Plugin\\IntentionSeo\\', __DIR__ . '/classes');
        $loader->register();

        return $loader;
    }

    public function onRegisterPermissions(PermissionsRegisterEvent $event): void
    {
        $permissions = $event->permissions;
        $permissions->addActions(
            PermissionsReader::fromYaml("plugin://{$this->name}/permissions.yaml")
        );
    }

    public function onPluginsInitialized(): void
    {
        if ($this->isCli()) {
            return;
        }

        // API calls are not always marked as admin, so register them on every web request.
        $this->enable([
            'onApiRegisterRoutes' => ['onApiRegisterRoutes', 0],
            'onApiSidebarItems' => ['onApiSidebarItems', 0],
            'onApiPluginPageInfo' => ['onApiPluginPageInfo', 0],
            'onApiFloatingWidgets' => ['onApiFloatingWidgets', 0],
            'onApiBlueprintResolved' => ['onApiBlueprintResolved', 0],
            'onApiBeforePageUpdate' => ['onApiBeforePageSave', 0],
            'onApiBeforePageCreate' => ['onApiBeforePageSave', 0],
        ]);

        if ($this->isAdmin()) {
            return;
        }

        $this->enable([
            'onTwigTemplatePaths' => ['onTwigTemplatePaths', 0],
            'onTwigSiteVariables' => ['onTwigSiteVariables', 0],
            'onSitemapProcessed' => ['onSitemapProcessed', 0],
        ]);
    }

    public function onApiRegisterRoutes(Event $event): void
    {
        $routes = $event['routes'];
        $controller = \Grav\Plugin\IntentionSeo\Api\IntentionSeoApiController::class;

        $routes->get('/intention-seo/status', [$controller, 'status']);
        $routes->get('/intention-seo/page-status', [$controller, 'pageStatus']);
        $routes->get('/intention-seo/page-summary', [$controller, 'pageSummary']);
    }

    public function onApiSidebarItems(Event $event): void
    {
        if (!$this->config->get('plugins.intention-seo.enabled', true)) {
            return;
        }

        $items = $event['items'] ?? [];
        $item = [
            'id' => 'intention-seo',
            'plugin' => 'intention-seo',
            'label' => 'PLUGIN_INTENTION_SEO.SIDEBAR',
            'icon' => 'fa-search',
            'route' => '/plugin/intention-seo',
            'priority' => 30,
            'authorize' => 'admin.intention-seo.read',
        ];
        if (!(new SeoResolver($this->grav))->siteIndex()) {
            $item['badge'] = 'noindex';
        }
        $items[] = $item;
        $event['items'] = $items;
    }

    public function onApiPluginPageInfo(Event $event): void
    {
        if (($event['plugin'] ?? null) !== 'intention-seo') {
            return;
        }

        $event['definition'] = [
            'id' => 'intention-seo',
            'plugin' => 'intention-seo',
            'title' => 'SEO',
            'icon' => 'fa-search',
            'page_type' => 'blueprint',
            'blueprint' => 'intention-seo',
            'data_endpoint' => '/config/plugins/intention-seo',
            'save_endpoint' => '/config/plugins/intention-seo',
            'actions' => [
                [
                    'id' => 'save',
                    'label' => 'Save',
                    'icon' => 'fa-check',
                    'primary' => true,
                ],
            ],
        ];
    }

    public function onApiFloatingWidgets(Event $event): void
    {
        if (!$this->config->get('plugins.intention-seo.enabled', true)) {
            return;
        }

        $widgets = $event['widgets'] ?? [];
        $widgets[] = [
            'id' => 'intention-seo',
            'plugin' => 'intention-seo',
            'label' => 'SEO',
            'icon' => 'search',
            'showFab' => false,
            'autoLoad' => true,
            'priority' => 0,
            'authorize' => 'api.access',
        ];
        $event['widgets'] = $widgets;
    }

    public function onApiBlueprintResolved(Event $event): void
    {
        $context = (string) ($event['context'] ?? '');
        $fields = $event['fields'] ?? [];
        if (!is_array($fields)) {
            return;
        }

        if ($context === 'plugin-page' && ($event['plugin'] ?? '') === 'intention-seo') {
            if (!(new SeoResolver($this->grav))->siteIndex()) {
                array_unshift($fields, $this->bannerField('PLUGIN_INTENTION_SEO.SITE_NOINDEX_WARNING', '_site_notice'));
                $event['fields'] = $fields;
            }

            return;
        }

        if ($context !== 'page') {
            return;
        }

        $event['fields'] = $this->ensureSeoTab($fields, (string) ($event['template'] ?? ''));
    }

    public function onTwigTemplatePaths(): void
    {
        $this->grav['twig']->twig_paths[] = __DIR__ . '/templates';
    }

    public function onTwigSiteVariables(): void
    {
        $page = $this->grav['page'] ?? null;
        if (!$page instanceof PageInterface) {
            return;
        }

        $resolver = new SeoResolver($this->grav);
        $resolver->applyRobots($page);
        $this->grav['twig']->twig_vars['intention_seo'] = $resolver->openGraph($page);
    }

    public function onSitemapProcessed(Event $event): void
    {
        $sitemap = $event['sitemap'] ?? null;
        if (!is_array($sitemap)) {
            return;
        }

        $resolver = new SeoResolver($this->grav);
        $pages = $this->grav['pages'];
        $siteNoindex = !$resolver->siteIndex();

        foreach ($sitemap as $url => $entry) {
            if ($siteNoindex) {
                unset($sitemap[$url]);
                continue;
            }
            $route = '';
            if (is_object($entry) && isset($entry->route)) {
                $route = (string) $entry->route;
            }
            if ($route === '') {
                continue;
            }
            $page = $pages->find($route);
            if ($page instanceof PageInterface && $resolver->isNoindex($page)) {
                unset($sitemap[$url]);
            }
        }
    }

    /**
     * @param array<int|string, mixed> $fields
     * @return array<int|string, mixed>
     */
    private function ensureSeoTab(array $fields, string $template): array
    {
        $this->stripNamedFields($fields, ['header.metadata.description', 'header.seo.title', 'header.seo.robots', 'header.seo.og_title', 'header.seo.og_description', 'header.seo.og_image']);

        $language = $this->grav['language'];
        $resolver = new SeoResolver($this->grav);
        $siteNoindex = !$resolver->siteIndex();
        $modular = $this->isModularTemplate($template);
        $tabFields = [];

        if ($siteNoindex) {
            $tabFields[] = $this->bannerField('PLUGIN_INTENTION_SEO.SITE_NOINDEX_WARNING', 'header.seo._site_notice');
        }
        if ($modular) {
            $tabFields[] = $this->bannerField('PLUGIN_INTENTION_SEO.NO_URL', 'header.seo._route_notice');
        }

        $tabFields[] = [
            'name' => 'header.seo.robots',
            'type' => 'toggle',
            'label' => $language->translate('PLUGIN_INTENTION_SEO.ROBOTS'),
            'help' => $language->translate('PLUGIN_INTENTION_SEO.ROBOTS_HELP'),
            'highlight' => '',
            'default' => '',
            'disabled' => $siteNoindex || $modular,
            'options' => [
                ['value' => '', 'label' => $language->translate('PLUGIN_INTENTION_SEO.ROBOTS_INDEX')],
                ['value' => 'noindex', 'label' => $language->translate('PLUGIN_INTENTION_SEO.ROBOTS_NOINDEX')],
            ],
        ];
        $tabFields[] = [
            'name' => 'header.seo.title',
            'type' => 'seo_length',
            'label' => $language->translate('PLUGIN_INTENTION_SEO.META_TITLE'),
            'help' => $language->translate('PLUGIN_INTENTION_SEO.META_TITLE_HELP'),
            'classes' => 'iseo-composed',
        ];
        $tabFields[] = [
            'name' => 'header.metadata.description',
            'type' => 'seo_length',
            'label' => $language->translate('PLUGIN_INTENTION_SEO.META_DESCRIPTION'),
            'help' => $language->translate('PLUGIN_INTENTION_SEO.META_DESCRIPTION_HELP'),
            'rows' => 3,
        ];
        $tabFields[] = [
            'name' => 'header.seo._word_count',
            'type' => 'seo_word_count',
            'label' => $language->translate('PLUGIN_INTENTION_SEO.WORD_COUNT'),
        ];
        $tabFields[] = [
            'name' => 'header.seo.og_title',
            'type' => 'seo_length',
            'label' => $language->translate('PLUGIN_INTENTION_SEO.PAGE_OG_TITLE'),
            'help' => $language->translate('PLUGIN_INTENTION_SEO.PAGE_OG_TITLE_HELP'),
            'classes' => 'iseo-empty-ok',
        ];
        $tabFields[] = [
            'name' => 'header.seo.og_description',
            'type' => 'seo_length',
            'label' => $language->translate('PLUGIN_INTENTION_SEO.PAGE_OG_DESCRIPTION'),
            'help' => $language->translate('PLUGIN_INTENTION_SEO.PAGE_OG_DESCRIPTION_HELP'),
            'rows' => 3,
            'classes' => 'iseo-empty-ok',
        ];
        $tabFields[] = [
            'name' => 'header.seo.og_image',
            'type' => 'filepicker',
            'label' => $language->translate('PLUGIN_INTENTION_SEO.PAGE_OG_IMAGE'),
            'help' => $language->translate('PLUGIN_INTENTION_SEO.PAGE_OG_IMAGE_HELP'),
            'preview_images' => true,
        ];

        foreach ($fields as &$field) {
            if (!is_array($field) || ($field['type'] ?? '') !== 'tabs' || !isset($field['fields']) || !is_array($field['fields'])) {
                continue;
            }

            $tabs = &$field['fields'];
            $contentIndex = null;
            $seoIndex = null;
            foreach ($tabs as $i => $tab) {
                if (!is_array($tab)) {
                    continue;
                }
                $name = (string) ($tab['name'] ?? '');
                if ($name === 'content') {
                    $contentIndex = $i;
                }
                if ($name === 'seo') {
                    $seoIndex = $i;
                }
            }

            $seoTab = [
                'name' => 'seo',
                'type' => 'tab',
                'title' => $language->translate('PLUGIN_INTENTION_SEO.TAB'),
                'fields' => $tabFields,
            ];

            if ($seoIndex !== null) {
                $tabs[$seoIndex] = $seoTab;
            } elseif ($contentIndex !== null) {
                array_splice($tabs, (int) $contentIndex + 1, 0, [$seoTab]);
            } else {
                $tabs[] = $seoTab;
            }

            break;
        }
        unset($field);

        return $fields;
    }

    /**
     * @return array<string, mixed>
     */
    private function bannerField(string $languageKey, string $name): array
    {
        return [
            'name' => $name,
            'type' => 'seo_banner',
            'content' => $this->grav['language']->translate($languageKey),
        ];
    }

    public function onApiBeforePageSave(Event $event): void
    {
        $data = $event['data'] ?? null;
        if (is_array($data) && isset($data['header'])) {
            $data['header'] = $this->withoutDisplayKeys($data['header']);
            $event['data'] = $data;
        }

        if (isset($event['header'])) {
            $event['header'] = $this->withoutDisplayKeys($event['header']);
        }
    }

    private function withoutDisplayKeys(mixed $header): mixed
    {
        if (is_object($header)) {
            $header = (array) $header;
        }
        if (!is_array($header) || !isset($header['seo']) || !is_array($header['seo'])) {
            return $header;
        }

        unset($header['seo']['_site_notice'], $header['seo']['_route_notice'], $header['seo']['_word_count']);
        if ($header['seo'] === []) {
            unset($header['seo']);
        }

        return $header;
    }

    private function isModularTemplate(string $template): bool
    {
        if ($template === '') {
            return false;
        }
        if (str_starts_with($template, 'modular/')) {
            return true;
        }

        $types = $this->grav['pages']->modularTypes();

        return isset($types[$template]) || isset($types['modular/' . $template]);
    }

    /**
     * @param array<int|string, mixed> $fields
     * @param list<string> $names
     */
    private function stripNamedFields(array &$fields, array $names): void
    {
        $kept = [];
        foreach ($fields as $field) {
            if (!is_array($field)) {
                continue;
            }
            if (in_array((string) ($field['name'] ?? ''), $names, true)) {
                continue;
            }
            if (isset($field['fields']) && is_array($field['fields'])) {
                $this->stripNamedFields($field['fields'], $names);
            }
            $kept[] = $field;
        }
        $fields = $kept;
    }
}
