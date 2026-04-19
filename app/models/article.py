from pydantic import BaseModel


class Article(BaseModel):
    title: str
    content: str
    category: str | None = None
    author: str | None = None
    tags: list[str] = []
    url: str | None = None
