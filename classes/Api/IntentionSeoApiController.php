<?php

declare(strict_types=1);

namespace Grav\Plugin\IntentionSeo\Api;

use Grav\Common\Page\Interfaces\PageInterface;
use Grav\Plugin\Api\Controllers\AbstractApiController;
use Grav\Plugin\Api\Exceptions\NotFoundException;
use Grav\Plugin\Api\Response\ApiResponse;
use Grav\Plugin\IntentionSeo\SeoResolver;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

class IntentionSeoApiController extends AbstractApiController
{
    public function status(ServerRequestInterface $request): ResponseInterface
    {
        $this->requirePermission($request, 'api.access');
        $resolver = new SeoResolver($this->grav);

        return ApiResponse::create([
            'site_noindex' => !$resolver->siteIndex(),
            'message' => 'This site is set to noindex. Search engines are asked not to index any page.',
        ]);
    }

    public function pageStatus(ServerRequestInterface $request): ResponseInterface
    {
        $this->requirePermission($request, 'api.pages.read');
        $resolver = new SeoResolver($this->grav);
        $rows = [];
        $pages = $this->grav['pages'];
        $pages->enablePages();

        foreach ($pages->all() as $page) {
            if (!$page instanceof PageInterface) {
                continue;
            }
            $rows[] = $resolver->listingRow($page);
        }

        return ApiResponse::create([
            'site_noindex' => !$resolver->siteIndex(),
            'pages' => $rows,
        ]);
    }

    public function pageSummary(ServerRequestInterface $request): ResponseInterface
    {
        $this->requirePermission($request, 'api.pages.read');
        $route = trim((string) ($request->getQueryParams()['route'] ?? ''));
        $route = ($route === '' || $route === '/') ? '/' : '/' . trim($route, '/');

        $pages = $this->grav['pages'];
        $pages->enablePages();
        $page = $pages->find($route);
        if (!$page instanceof PageInterface) {
            throw new NotFoundException('Page not found.');
        }

        return ApiResponse::create((new SeoResolver($this->grav))->summary($page));
    }
}
