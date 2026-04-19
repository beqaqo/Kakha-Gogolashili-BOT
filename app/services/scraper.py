import json
from concurrent.futures import ThreadPoolExecutor

import requests
from bs4 import BeautifulSoup
from tqdm import tqdm


def scrape(url: str):
    """
    output JSON: [{"category": "string", "title": "string", "text": "string"}]
    """
    html = requests.get(url).text
    soup = BeautifulSoup(html, "html.parser")
    categories_list = soup.select_one("#categories-4 ul")

    category_links = [li.select_one("a") for li in categories_list.select("li")]
    categories = [(a.text, a["href"]) for a in category_links]

    with ThreadPoolExecutor(max_workers=30) as executor:
        article_lists = list(tqdm(
            executor.map(fetch_category_articles, categories),
            total=len(categories),
            desc="Categories",
        ))
        article_refs = [ref for sublist in article_lists for ref in sublist]

        articles = list(tqdm(
            executor.map(scrape_article, article_refs),
            total=len(article_refs),
            desc="Articles",
        ))

    return articles

def fetch_category_articles(category: tuple[str, str]):
    category_name, category_url = category
    html = requests.get(category_url).text
    soup = BeautifulSoup(html, "html.parser")
    return [(category_name, a["href"]) for a in soup.select(".entry-title > a")]

def scrape_article(article: tuple[str, str]):
    category_name, url = article
    html = requests.get(url).text
    soup = BeautifulSoup(html, "html.parser")
    title = soup.select_one(".entry-title").text
    text = soup.select_one(".entry-content").text
    return {
        "category": category_name,
        "title": title,
        "content": text,
    }

if __name__ == "__main__":
    result = scrape("https://astronet.ge/")
    with open("articles.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
