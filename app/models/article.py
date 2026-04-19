from pydantic import BaseModel


class Article(BaseModel):
    title: str
    author: str
    category: str
    tags: list[str]
    content: str
