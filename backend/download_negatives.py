from icrawler.builtin import BingImageCrawler

keywords = [
    "yellow wall",
    "yellow light bulb",
    "room lighting",
    "sunlight room",
    "lamp light",
    "street light night",
    "orange object",
    "yellow background",
    "LED light strip",
    "bright reflection"
]

for k in keywords:
    crawler = BingImageCrawler(storage={'root_dir': f'neg/{k.replace(" ", "_")}'})
    crawler.crawl(keyword=k, max_num=100)