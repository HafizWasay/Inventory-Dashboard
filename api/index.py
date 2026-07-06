from server import Handler


# Keep the handler class in this entrypoint so Vercel's Python function
# discovery can identify it during the build.
class handler(Handler):
    pass
