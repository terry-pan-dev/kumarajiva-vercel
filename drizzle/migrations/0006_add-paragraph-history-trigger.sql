-- Custom SQL migration file, put you code below! --
CREATE OR REPLACE FUNCTION log_paragraph_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert a record into ParagraphHistory table
    INSERT INTO "paragraphs_history" (paragraph_id, old_content, new_content, updated_by, updated_at)
    VALUES (
        NEW.id,         -- ID of the paragraph being updated
        OLD.content,    -- Old content before the update
        NEW.content,    -- New content after the update
        NEW.updated_by, -- New updated_by
        NOW()           -- Current timestamp
    );

    -- Allow the update on the Paragraph table to proceed
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_paragraph_changes
AFTER UPDATE OF content ON "paragraphs"
FOR EACH ROW
WHEN (OLD.content IS DISTINCT FROM NEW.content) -- Check if content actually changed
EXECUTE FUNCTION log_paragraph_changes();